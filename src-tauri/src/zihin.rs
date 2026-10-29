//! Zihin paketi (isteğe bağlı yerel yapay zekâ) için dosya indirme.
//!
//! - Yalnızca bu deponun GitHub sürüm adreslerinden indirir (manifest ve paket dosyaları).
//! - Her dosya manifestteki SHA-256 ve boyutla doğrulanır; uyuşmazsa silinir.
//! - Dosyalar uygulamanın yerel veri klasöründeki `zihin` alt klasörüne yazılır ve ön yüze
//!   yalnızca bu klasörle sınırlı asset protokolüyle açılır.
//! - Model hiçbir zaman çalıştırılabilir dosya değildir; WebAssembly içinde, WebView'in kum havuzunda çalışır.

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const PREFIX: &str = "https://github.com/Eirahoutmoss/NexLearn/releases/download/";
const MAX_MANIFEST: usize = 256 * 1024;
const MAX_FILE: u64 = 3 * 1024 * 1024 * 1024;

#[derive(Clone, Serialize)]
pub struct ZihinFile {
    name: String,
    size: u64,
    path: String,
}

#[derive(Clone, Serialize)]
struct Progress {
    name: String,
    downloaded: u64,
    total: u64,
}

pub fn valid_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    !name.is_empty()
        && name.len() <= 160
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
        && !name.contains("..")
        && (lower.ends_with(".gguf") || lower.ends_with(".wasm"))
}

fn dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("NexLearn"))
        .join("zihin")
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("NexLearn-Zihin/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "client".into())
}

/// Manifesti (küçük JSON) indirir.
#[tauri::command]
pub async fn zihin_fetch_manifest(url: String) -> Result<String, String> {
    if !url.starts_with(PREFIX) || !url.ends_with(".json") {
        return Err("invalid-url".into());
    }
    let resp = client()?.get(&url).send().await.and_then(|r| r.error_for_status()).map_err(|_| "manifest-download")?;
    let bytes = resp.bytes().await.map_err(|_| "manifest-read")?;
    if bytes.len() > MAX_MANIFEST {
        return Err("manifest-too-large".into());
    }
    String::from_utf8(bytes.to_vec()).map_err(|_| "manifest-utf8".into())
}

#[tauri::command]
pub async fn zihin_download<R: Runtime>(app: AppHandle<R>, url: String, file_name: String, sha256: String, size: u64) -> Result<ZihinFile, String> {
    if !url.starts_with(PREFIX) || !url.ends_with(&format!("/{file_name}")) {
        return Err("invalid-url".into());
    }
    if !valid_name(&file_name) || sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) || size == 0 || size > MAX_FILE {
        return Err("invalid-args".into());
    }
    let d = dir(&app);
    std::fs::create_dir_all(&d).map_err(|_| "dir")?;
    let final_path = d.join(&file_name);
    let part = d.join(format!("{file_name}.part"));
    let resp = client()?.get(&url).send().await.and_then(|r| r.error_for_status()).map_err(|_| "download")?;
    if resp.content_length().map(|l| l != size).unwrap_or(false) {
        return Err("size-mismatch".into());
    }
    let mut f = std::fs::File::create(&part).map_err(|_| "create")?;
    let mut hasher = Sha256::new();
    let mut done = 0u64;
    let mut last = 0u64;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| {
            let _ = std::fs::remove_file(&part);
            "stream"
        })?;
        done += chunk.len() as u64;
        if done > size {
            let _ = std::fs::remove_file(&part);
            return Err("size-mismatch".into());
        }
        hasher.update(&chunk);
        f.write_all(&chunk).map_err(|_| "write")?;
        if done - last > 2 * 1024 * 1024 || done == size {
            last = done;
            let _ = app.emit("zihin-progress", Progress { name: file_name.clone(), downloaded: done, total: size });
        }
    }
    f.flush().map_err(|_| "flush")?;
    drop(f);
    if done != size || hex::encode(hasher.finalize()) != sha256.to_ascii_lowercase() {
        let _ = std::fs::remove_file(&part);
        return Err("checksum-mismatch".into());
    }
    std::fs::rename(&part, &final_path).map_err(|_| "rename")?;
    Ok(ZihinFile { name: file_name, size, path: final_path.to_string_lossy().into_owned() })
}

#[tauri::command]
pub fn zihin_files<R: Runtime>(app: AppHandle<R>) -> Vec<ZihinFile> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir(&app)) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if valid_name(&name) {
                if let Ok(m) = e.metadata() {
                    out.push(ZihinFile { name, size: m.len(), path: e.path().to_string_lossy().into_owned() });
                }
            }
        }
    }
    out
}

#[tauri::command]
pub fn zihin_remove<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let d = dir(&app);
    if let Ok(entries) = std::fs::read_dir(&d) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if valid_name(&name) || name.ends_with(".part") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert!(valid_name("qwen3-0.6b-q4_k_m.gguf"));
        assert!(valid_name("wllama.wasm"));
        assert!(!valid_name("../x.gguf"));
        assert!(!valid_name("x.exe"));
        assert!(!valid_name("a b.gguf"));
    }
}
