//! NexLearn masaüstü kabuğu (Tauri 2).
//!
//! Uygulamanın tüm verisi WebView'in yerel IndexedDB deposundadır. Rust tarafı yalnızca
//! kullanıcının düğmeyle başlattığı güncelleme indirme/kurma işlemini yapar:
//! - Yalnızca bu deponun GitHub sürüm adreslerinden indirir.
//! - Kurulum dosyasını SHA256SUMS içindeki özetle doğrular; uyuşmazsa dosyayı siler.
//! - Kurucu yalnızca uygulamanın kendi yerel veri klasöründeki `updates` alt klasöründen çalıştırılır
//!   (genel %TEMP% yerine; antivirüs sezgilerinin "geçiciden çalıştırma" işaretini önler).
//! - Kalıcı arka plan hizmeti, otomatik başlatma, kanca ya da açık port yoktur.

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

const DOWNLOAD_PREFIX: &str = "https://github.com/Eirahoutmoss/NexLearn/releases/download/";
const MAX_INSTALLER_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Clone, Serialize)]
struct Progress {
    downloaded: u64,
    total: u64,
}

fn update_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("NexLearn"))
        .join("updates")
}

/// Program Files altındaki kurulum MSI ile (makine geneli), diğerleri NSIS ile (kullanıcı) yapılmıştır.
fn kind_for_exe(exe: &Path) -> &'static str {
    let s = exe.to_string_lossy().to_ascii_lowercase().replace('/', "\\");
    if s.contains("\\program files\\") || s.contains("\\program files (x86)\\") {
        "msi"
    } else {
        "nsis"
    }
}

#[tauri::command]
fn install_kind() -> String {
    std::env::current_exe()
        .map(|p| kind_for_exe(&p).to_string())
        .unwrap_or_else(|_| "nsis".into())
}

fn valid_file_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    !name.is_empty()
        && name.len() <= 120
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
        && !name.contains("..")
        && (lower.ends_with(".exe") || lower.ends_with(".msi"))
}

/// SHA256SUMS biçimi: "<64 hex>  <dosya adı>" (sha256sum çıktısı; '*' ikili işaretine izin verilir).
fn expected_hash(sums: &str, file_name: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        let name = parts.next()?.trim_start_matches('*');
        let base = name.rsplit('/').next().unwrap_or(name);
        if base == file_name && hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
            Some(hash.to_ascii_lowercase())
        } else {
            None
        }
    })
}

#[tauri::command]
async fn download_update(
    app: AppHandle,
    url: String,
    checksums_url: String,
    file_name: String,
) -> Result<String, String> {
    if !url.starts_with(DOWNLOAD_PREFIX) || !checksums_url.starts_with(DOWNLOAD_PREFIX) {
        return Err("invalid-url".into());
    }
    if !valid_file_name(&file_name) || !url.ends_with(&format!("/{file_name}")) {
        return Err("invalid-file-name".into());
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("NexLearn-Updater/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "client")?;

    let sums = client
        .get(&checksums_url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| "checksums-download")?
        .text()
        .await
        .map_err(|_| "checksums-read")?;
    let expected = expected_hash(&sums, &file_name).ok_or("checksum-missing")?;

    let resp = client
        .get(&url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| "download")?;
    let total = resp.content_length().unwrap_or(0);
    if total > MAX_INSTALLER_BYTES {
        return Err("too-large".into());
    }

    let dir = update_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|_| "update-dir")?;
    // Eski indirmeleri temizle (yalnızca bu klasördeki kurucular).
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            if e.file_name().to_str().map(valid_file_name).unwrap_or(false) {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    let path = dir.join(&file_name);
    let mut file = std::fs::File::create(&path).map_err(|_| "create-file")?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    let mut last_emit = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "stream")?;
        downloaded += chunk.len() as u64;
        if downloaded > MAX_INSTALLER_BYTES {
            let _ = std::fs::remove_file(&path);
            return Err("too-large".into());
        }
        hasher.update(&chunk);
        file.write_all(&chunk).map_err(|_| "write")?;
        if downloaded - last_emit > 256 * 1024 || downloaded == total {
            last_emit = downloaded;
            let _ = app.emit("update-progress", Progress { downloaded, total });
        }
    }
    file.flush().map_err(|_| "flush")?;
    drop(file);

    let actual = hex::encode(hasher.finalize());
    if actual != expected {
        let _ = std::fs::remove_file(&path);
        return Err("checksum-mismatch".into());
    }
    Ok(path.to_string_lossy().into_owned())
}

fn is_inside(child: &Path, parent: &Path) -> bool {
    match (child.canonicalize(), parent.canonicalize()) {
        (Ok(c), Ok(p)) => c.starts_with(p),
        _ => false,
    }
}

#[tauri::command]
fn install_update(app: AppHandle, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
    if !valid_file_name(&name) || !p.is_file() || !is_inside(&p, &update_dir(&app)) {
        return Err("invalid-path".into());
    }
    let lower = name.to_ascii_lowercase();
    let spawned = if lower.ends_with(".msi") {
        std::process::Command::new("msiexec").arg("/i").arg(&p).spawn()
    } else {
        std::process::Command::new(&p).spawn()
    };
    spawned.map_err(|_| "spawn")?;
    // Kurucu dosyaları değiştirebilsin diye uygulama kapanır; veriler WebView deposunda korunur.
    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![download_update, install_update, install_kind])
        .run(tauri::generate_context!())
        .expect("NexLearn başlatılamadı");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_name_rules() {
        assert!(valid_file_name("NexLearn_0.2.0_x64-setup.exe"));
        assert!(valid_file_name("NexLearn_0.2.0_x64_tr-TR.msi"));
        assert!(!valid_file_name("../evil.exe"));
        assert!(!valid_file_name("script.ps1"));
        assert!(!valid_file_name("a b.exe"));
    }

    #[test]
    fn install_kind_from_path() {
        assert_eq!(kind_for_exe(Path::new("C:\\Program Files\\NexLearn\\nexlearn.exe")), "msi");
        assert_eq!(kind_for_exe(Path::new("C:\\Users\\h\\AppData\\Local\\NexLearn\\nexlearn.exe")), "nsis");
    }

    #[test]
    fn parses_sha256sums() {
        let h = "a".repeat(64);
        let sums = format!("{h}  NexLearn_0.2.0_x64-setup.exe\n{}  other.msi\n", "b".repeat(64));
        assert_eq!(expected_hash(&sums, "NexLearn_0.2.0_x64-setup.exe"), Some(h));
        assert_eq!(expected_hash(&sums, "missing.exe"), None);
        let star = format!("{}  *dist/x.exe", "C".repeat(64));
        assert_eq!(expected_hash(&star, "x.exe"), Some("c".repeat(64)));
    }
}
