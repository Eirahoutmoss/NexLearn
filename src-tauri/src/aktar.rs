//! NexAktar — telefondan masaüstüne (ve tersine) yerel ağ üzerinden dosya aktarımı.
//!
//! Tasarım ilkeleri (bkz. docs/NEXAKTAR.md):
//! - Sunucu yalnızca kullanıcı düğmeye bastığında açılır; rastgele bir portta dinler ve en geç
//!   `SESSION_SECS` saniye sonra kendiliğinden kapanır. Arka plan hizmeti ya da otomatik başlatma yoktur.
//! - Her oturum 128 bitlik tek kullanımlık bir anahtar taşır (QR koddaki adreste). Anahtarsız istekler
//!   reddedilir; çok sayıda hatalı deneme oturumu kapatır.
//! - Yalnızca özel ağ (LAN) ve yerel adreslerden gelen bağlantılar kabul edilir.
//! - Gelen her dosya önce uygulamanın kendi klasöründe bekletilir; kullanıcı masaüstünde tek tek
//!   onaylamadan kitaplığa girmez. Reddedilen ya da oturum kapanınca kalan dosyalar silinir.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tiny_http::{Header, Method, Request, Response, Server};

pub const SESSION_SECS: u64 = 10 * 60;
const MAX_FILE_BYTES: u64 = 300 * 1024 * 1024;
const MAX_TEXT_BYTES: u64 = 1024 * 1024;
const MAX_FILES_PER_SESSION: usize = 300;
const MAX_BAD_ATTEMPTS: u32 = 20;
const PAGE: &str = include_str!("aktar_page.html");

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Incoming {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub mime: String,
    #[serde(skip)]
    pub path: PathBuf,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outgoing {
    pub id: String,
    pub name: String,
    pub size: u64,
    #[serde(skip)]
    pub path: PathBuf,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub url: String,
    pub host: String,
    pub port: u16,
    pub qr_svg: String,
    pub remaining_secs: u64,
    pub outgoing: Vec<Outgoing>,
}

struct Session {
    token: String,
    host: String,
    port: u16,
    deadline: Arc<Mutex<Instant>>,
    stop: Arc<AtomicBool>,
    inbox: Arc<Mutex<HashMap<String, Incoming>>>,
    outbox: Arc<Mutex<Vec<Outgoing>>>,
    dir: PathBuf,
}

#[derive(Default)]
pub struct AktarState(Mutex<Option<Session>>);

fn random_hex(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).map_err(|_| "random")?;
    Ok(hex::encode(buf))
}

/// Sabit süreli karşılaştırma (anahtar tahmininde zamanlama sızıntısını önler).
fn same(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Yalnızca yerel/özel ağ adresleri: 10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, IPv6 ULA ve link-local.
pub fn is_private(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return v4.is_private() || v4.is_loopback() || v4.is_link_local();
            }
            let s = v6.segments()[0];
            v6.is_loopback() || (s & 0xfe00) == 0xfc00 || (s & 0xffc0) == 0xfe80
        }
    }
}

/// Varsayılan yönlendirmeye giden arayüzün yerel adresi. UDP "connect" paket göndermez.
fn lan_ip() -> Option<IpAddr> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("192.0.2.1:9").ok()?;
    let ip = sock.local_addr().ok()?.ip();
    if is_private(&ip) && !ip.is_loopback() {
        Some(ip)
    } else {
        None
    }
}

/// Dosya adını güvenli hâle getirir: yol ayırıcıları ve denetim karakterleri atılır, uzunluk sınırlanır.
pub fn safe_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or(raw);
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.').to_string();
    let mut out: String = trimmed.chars().take(120).collect();
    if out.is_empty() {
        out = "dosya".into();
    }
    out
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(v) = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn query_param<'a>(url: &'a str, key: &str) -> Option<&'a str> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then_some(v)
    })
}

fn guess_mime(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    match ext {
        "pdf" => "application/pdf",
        "epub" => "application/epub+zip",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "heic" | "heif" => "image/heic",
        "md" | "markdown" => "text/markdown",
        "txt" | "text" => "text/plain",
        "zip" => "application/zip",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
    .into()
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("geçerli başlık")
}

fn secure<R: Read>(r: Response<R>) -> Response<R> {
    r.with_header(header("X-Content-Type-Options", "nosniff"))
        .with_header(header("Referrer-Policy", "no-referrer"))
        .with_header(header("Cache-Control", "no-store"))
        .with_header(header("X-Frame-Options", "DENY"))
}

fn json(status: u16, body: String) -> Response<std::io::Cursor<Vec<u8>>> {
    secure(Response::from_string(body).with_status_code(status).with_header(header("Content-Type", "application/json; charset=utf-8")))
}

struct Ctx<R: Runtime> {
    app: AppHandle<R>,
    token: String,
    deadline: Arc<Mutex<Instant>>,
    stop: Arc<AtomicBool>,
    inbox: Arc<Mutex<HashMap<String, Incoming>>>,
    outbox: Arc<Mutex<Vec<Outgoing>>>,
    dir: PathBuf,
    bad: AtomicU32,
    received: Mutex<usize>,
}

fn remaining(deadline: &Mutex<Instant>) -> u64 {
    deadline.lock().map(|d| d.saturating_duration_since(Instant::now()).as_secs()).unwrap_or(0)
}

fn handle<R: Runtime>(ctx: &Ctx<R>, mut req: Request) {
    let peer_ok = req.remote_addr().map(|a: &SocketAddr| is_private(&a.ip())).unwrap_or(false);
    if !peer_ok {
        let _ = req.respond(json(403, r#"{"error":"network"}"#.into()));
        return;
    }
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    let token_ok = query_param(&url, "t").map(|t| same(t, &ctx.token)).unwrap_or(false);
    if !token_ok {
        let n = ctx.bad.fetch_add(1, Ordering::SeqCst) + 1;
        if n >= MAX_BAD_ATTEMPTS {
            ctx.stop.store(true, Ordering::SeqCst);
            let _ = ctx.app.emit("aktar-stopped", "abuse");
        }
        let _ = req.respond(secure(
            Response::from_string("NexAktar: bağlantı geçersiz ya da süresi dolmuş. / Link invalid or expired.")
                .with_status_code(403)
                .with_header(header("Content-Type", "text/plain; charset=utf-8")),
        ));
        return;
    }

    match (req.method().clone(), path.as_str()) {
        (Method::Get, "/") => {
            let resp = Response::from_string(PAGE)
                .with_header(header("Content-Type", "text/html; charset=utf-8"))
                .with_header(header(
                    "Content-Security-Policy",
                    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
                ));
            let _ = req.respond(secure(resp));
        }
        (Method::Get, "/ping") => {
            let _ = req.respond(json(200, format!(r#"{{"ok":true,"remaining":{}}}"#, remaining(&ctx.deadline))));
        }
        (Method::Post, "/u") | (Method::Post, "/text") => {
            let is_text = path == "/text";
            let limit = if is_text { MAX_TEXT_BYTES } else { MAX_FILE_BYTES };
            let len = req.body_length().map(|l| l as u64);
            if len.map(|l| l > limit).unwrap_or(false) {
                let _ = req.respond(json(413, r#"{"error":"too-large"}"#.into()));
                return;
            }
            {
                let count = ctx.received.lock().map(|c| *c).unwrap_or(0);
                if count >= MAX_FILES_PER_SESSION {
                    let _ = req.respond(json(429, r#"{"error":"too-many"}"#.into()));
                    return;
                }
            }
            let raw_name = req
                .headers()
                .iter()
                .find(|h| h.field.equiv("X-Name"))
                .map(|h| percent_decode(h.value.as_str()))
                .unwrap_or_default();
            let name = if is_text {
                let n = safe_name(&raw_name);
                if n == "dosya" { "Telefondan not.txt".to_string() } else if n.to_ascii_lowercase().ends_with(".txt") { n } else { format!("{n}.txt") }
            } else {
                safe_name(&raw_name)
            };
            let id = match random_hex(12) {
                Ok(v) => v,
                Err(_) => {
                    let _ = req.respond(json(500, r#"{"error":"random"}"#.into()));
                    return;
                }
            };
            let file_path = ctx.dir.join(format!("{id}.part"));
            let result = (|| -> Result<u64, &'static str> {
                let mut f = std::fs::File::create(&file_path).map_err(|_| "create")?;
                let mut reader = req.as_reader().take(limit + 1);
                let mut buf = vec![0u8; 64 * 1024];
                let mut total = 0u64;
                loop {
                    let n = reader.read(&mut buf).map_err(|_| "read")?;
                    if n == 0 {
                        break;
                    }
                    total += n as u64;
                    if total > limit {
                        return Err("too-large");
                    }
                    f.write_all(&buf[..n]).map_err(|_| "write")?;
                }
                f.flush().map_err(|_| "flush")?;
                if total == 0 {
                    return Err("empty");
                }
                Ok(total)
            })();
            match result {
                Ok(size) => {
                    let item = Incoming { id: id.clone(), mime: guess_mime(&name), name, size, path: file_path };
                    if let Ok(mut inbox) = ctx.inbox.lock() {
                        inbox.insert(id.clone(), item.clone());
                    }
                    if let Ok(mut c) = ctx.received.lock() {
                        *c += 1;
                    }
                    let _ = ctx.app.emit("aktar-incoming", item);
                    let _ = req.respond(json(200, format!(r#"{{"ok":true,"id":"{id}"}}"#)));
                }
                Err(e) => {
                    let _ = std::fs::remove_file(&file_path);
                    let status = if e == "too-large" { 413 } else if e == "empty" { 400 } else { 500 };
                    let _ = req.respond(json(status, format!(r#"{{"error":"{e}"}}"#)));
                }
            }
        }
        (Method::Get, "/o") => {
            let list = ctx.outbox.lock().map(|o| o.clone()).unwrap_or_default();
            let _ = req.respond(json(200, serde_json::to_string(&list).unwrap_or_else(|_| "[]".into())));
        }
        (Method::Get, p) if p.starts_with("/o/") => {
            let id = &p[3..];
            let item = ctx.outbox.lock().ok().and_then(|o| o.iter().find(|x| x.id == id).cloned());
            match item.and_then(|it| std::fs::File::open(&it.path).ok().map(|f| (it, f))) {
                Some((it, f)) => {
                    let ascii: String = it.name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' }).collect();
                    let encoded: String = it.name.bytes().map(|b| if b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'_' { (b as char).to_string() } else { format!("%{b:02X}") }).collect();
                    let resp = Response::from_file(f)
                        .with_header(header("Content-Type", "application/octet-stream"))
                        .with_header(header("Content-Disposition", &format!("attachment; filename=\"{ascii}\"; filename*=UTF-8''{encoded}")));
                    let _ = req.respond(secure(resp));
                }
                None => {
                    let _ = req.respond(json(404, r#"{"error":"not-found"}"#.into()));
                }
            }
        }
        _ => {
            let _ = req.respond(json(404, r#"{"error":"not-found"}"#.into()));
        }
    }
}

fn session_dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("NexLearn"))
        .join("aktar")
}

fn clear_dir(dir: &Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            if e.path().is_file() {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
}

fn qr_svg(text: &str) -> Result<String, String> {
    let code = qrcode::QrCode::with_error_correction_level(text.as_bytes(), qrcode::EcLevel::M).map_err(|_| "qr")?;
    Ok(code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(240, 240)
        .quiet_zone(true)
        .dark_color(qrcode::render::svg::Color("#000000"))
        .light_color(qrcode::render::svg::Color("#ffffff"))
        .build())
}

fn info(s: &Session) -> Result<SessionInfo, String> {
    let url = format!("http://{}:{}/?t={}", s.host, s.port, s.token);
    Ok(SessionInfo {
        qr_svg: qr_svg(&url)?,
        url,
        host: s.host.clone(),
        port: s.port,
        remaining_secs: remaining(&s.deadline),
        outgoing: s.outbox.lock().map(|o| o.clone()).unwrap_or_default(),
    })
}

fn current(guard: &mut Option<Session>) -> Option<&Session> {
    let alive = guard.as_ref().map(|s| !s.stop.load(Ordering::SeqCst) && remaining(&s.deadline) > 0).unwrap_or(false);
    if !alive {
        if let Some(s) = guard.take() {
            s.stop.store(true, Ordering::SeqCst);
            clear_dir(&s.dir);
        }
        return None;
    }
    guard.as_ref()
}

#[tauri::command]
pub fn aktar_start<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, AktarState>) -> Result<SessionInfo, String> {
    start_on(app, &state, None)
}

fn start_on<R: Runtime>(app: AppHandle<R>, state: &AktarState, ip_override: Option<IpAddr>) -> Result<SessionInfo, String> {
    let mut guard = state.0.lock().map_err(|_| "lock")?;
    if let Some(s) = current(&mut guard) {
        return info(s);
    }
    let ip = ip_override.or_else(lan_ip).ok_or("no-lan")?;
    let host = match ip {
        IpAddr::V4(v4) => v4.to_string(),
        IpAddr::V6(v6) => format!("[{v6}]"),
    };
    let server = Server::http(SocketAddr::new(ip, 0)).map_err(|_| "bind")?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("bind")?;
    let token = random_hex(16)?;
    let dir = session_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|_| "dir")?;
    clear_dir(&dir);
    let deadline = Arc::new(Mutex::new(Instant::now() + Duration::from_secs(SESSION_SECS)));
    let stop = Arc::new(AtomicBool::new(false));
    let inbox = Arc::new(Mutex::new(HashMap::new()));
    let outbox = Arc::new(Mutex::new(Vec::new()));
    let ctx = Ctx {
        app: app.clone(),
        token: token.clone(),
        deadline: deadline.clone(),
        stop: stop.clone(),
        inbox: inbox.clone(),
        outbox: outbox.clone(),
        dir: dir.clone(),
        bad: AtomicU32::new(0),
        received: Mutex::new(0),
    };
    std::thread::spawn(move || {
        loop {
            if ctx.stop.load(Ordering::SeqCst) || remaining(&ctx.deadline) == 0 {
                break;
            }
            match server.recv_timeout(Duration::from_millis(500)) {
                Ok(Some(req)) => handle(&ctx, req),
                Ok(None) => {}
                Err(_) => break,
            }
        }
        ctx.stop.store(true, Ordering::SeqCst);
        let _ = ctx.app.emit("aktar-stopped", "closed");
        // Sunucu bu iş parçacığıyla birlikte düşer; port kapanır.
    });
    let session = Session { token, host, port, deadline, stop, inbox, outbox, dir };
    let out = info(&session);
    *guard = Some(session);
    out
}

#[tauri::command]
pub fn aktar_status(state: tauri::State<'_, AktarState>) -> Result<Option<SessionInfo>, String> {
    let mut guard = state.0.lock().map_err(|_| "lock")?;
    match current(&mut guard) {
        Some(s) => info(s).map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn aktar_extend(state: tauri::State<'_, AktarState>) -> Result<u64, String> {
    let mut guard = state.0.lock().map_err(|_| "lock")?;
    let s = current(&mut guard).ok_or("no-session")?;
    let mut d = s.deadline.lock().map_err(|_| "lock")?;
    *d = Instant::now() + Duration::from_secs(SESSION_SECS);
    Ok(SESSION_SECS)
}

#[tauri::command]
pub fn aktar_stop(state: tauri::State<'_, AktarState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "lock")?;
    if let Some(s) = guard.take() {
        s.stop.store(true, Ordering::SeqCst);
        clear_dir(&s.dir);
    }
    Ok(())
}

#[tauri::command]
pub fn aktar_pending(state: tauri::State<'_, AktarState>) -> Result<Vec<Incoming>, String> {
    let mut guard = state.0.lock().map_err(|_| "lock")?;
    Ok(current(&mut guard).and_then(|s| s.inbox.lock().ok().map(|i| i.values().cloned().collect())).unwrap_or_default())
}

/// Onaylanan dosyanın baytlarını döndürür ve bekleme klasöründen siler.
#[tauri::command]
pub fn aktar_take(state: tauri::State<'_, AktarState>, id: String) -> Result<tauri::ipc::Response, String> {
    let mut guard = state.0.lock().map_err(|_| "lock")?;
    let s = current(&mut guard).ok_or("no-session")?;
    let item = s.inbox.lock().map_err(|_| "lock")?.remove(&id).ok_or("not-found")?;
    let bytes = std::fs::read(&item.path).map_err(|_| "read")?;
    let _ = std::fs::remove_file(&item.path);
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn aktar_reject(state: tauri::State<'_, AktarState>, id: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "lock")?;
    if let Some(s) = current(&mut guard) {
        if let Some(item) = s.inbox.lock().map_err(|_| "lock")?.remove(&id) {
            let _ = std::fs::remove_file(&item.path);
        }
    }
    Ok(())
}

/// Telefona gönderilecek dosyayı sunar. Gövde ham bayt, ad `x-name` başlığında (URI kodlu).
#[tauri::command]
pub fn aktar_offer(state: tauri::State<'_, AktarState>, request: tauri::ipc::Request<'_>) -> Result<Vec<Outgoing>, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("body".into());
    };
    if bytes.is_empty() || bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("size".into());
    }
    let name = request.headers().get("x-name").and_then(|v| v.to_str().ok()).map(percent_decode).map(|n| safe_name(&n)).unwrap_or_else(|| "dosya".into());
    let mut guard = state.0.lock().map_err(|_| "lock")?;
    let s = current(&mut guard).ok_or("no-session")?;
    let id = random_hex(12)?;
    let path = s.dir.join(format!("{id}.out"));
    std::fs::write(&path, bytes).map_err(|_| "write")?;
    let mut out = s.outbox.lock().map_err(|_| "lock")?;
    out.push(Outgoing { id, name, size: bytes.len() as u64, path });
    Ok(out.clone())
}

#[tauri::command]
pub fn aktar_unoffer(state: tauri::State<'_, AktarState>, id: String) -> Result<Vec<Outgoing>, String> {
    let mut guard = state.0.lock().map_err(|_| "lock")?;
    let s = current(&mut guard).ok_or("no-session")?;
    let mut out = s.outbox.lock().map_err(|_| "lock")?;
    if let Some(pos) = out.iter().position(|o| o.id == id) {
        let it = out.remove(pos);
        let _ = std::fs::remove_file(it.path);
    }
    Ok(out.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_ranges() {
        for ok in ["192.168.1.5", "10.0.0.2", "172.20.1.1", "127.0.0.1", "169.254.3.3", "fd00::1", "fe80::1", "::ffff:192.168.0.2"] {
            assert!(is_private(&ok.parse().unwrap()), "{ok}");
        }
        for bad in ["8.8.8.8", "172.32.0.1", "2001:db8::1", "1.1.1.1"] {
            assert!(!is_private(&bad.parse().unwrap()), "{bad}");
        }
    }

    #[test]
    fn names_are_sanitized() {
        assert_eq!(safe_name("../../etc/passwd"), "passwd");
        assert_eq!(safe_name("C:\\Users\\x\\ödev notları.pdf"), "ödev notları.pdf");
        assert_eq!(safe_name(".hidden"), "hidden");
        assert_eq!(safe_name("a<b>:c?.txt"), "abc.txt");
        assert_eq!(safe_name(""), "dosya");
        assert_eq!(safe_name(&"x".repeat(300)).chars().count(), 120);
    }

    #[test]
    fn decoding_and_query() {
        assert_eq!(percent_decode("%C3%B6dev%201.pdf"), "ödev 1.pdf");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(query_param("/u?t=abc&x=1", "t"), Some("abc"));
        assert_eq!(query_param("/u", "t"), None);
        assert!(same("abcd", "abcd"));
        assert!(!same("abcd", "abce"));
        assert!(!same("abc", "abcd"));
    }

    fn http(host_port: &str, raw: &[u8]) -> String {
        use std::net::TcpStream;
        let mut s = TcpStream::connect(host_port).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        s.write_all(raw).unwrap();
        let mut out = String::new();
        let _ = s.read_to_string(&mut out);
        out
    }

    #[test]
    fn end_to_end_session() {
        let app = tauri::test::mock_app();
        app.manage(AktarState::default());
        let handle = app.handle().clone();
        // Döngü adresi her ortamda vardır; gerçek kullanımda LAN adresi seçilir.
        let info = start_on(handle.clone(), &app.state::<AktarState>(), Some("127.0.0.1".parse().unwrap())).unwrap();
        let hp = format!("{}:{}", info.host, info.port);
        let token = info.url.split("t=").nth(1).unwrap().to_string();

        let page = http(&hp, format!("GET /?t={token} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n").as_bytes());
        assert!(page.starts_with("HTTP/1.1 200"), "{page}");
        assert!(page.contains("NexAktar"));
        assert!(page.to_ascii_lowercase().contains("content-security-policy"));

        let bad = http(&hp, b"GET /?t=wrong HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
        assert!(bad.starts_with("HTTP/1.1 403"), "{bad}");

        let body = b"merhaba";
        let req = format!(
            "POST /u?t={token} HTTP/1.1\r\nHost: x\r\nX-Name: %C3%B6dev%2F..%2Fnot.txt\r\nContent-Length: {}\r\nConnection: close\r\n\r\nmerhaba",
            body.len()
        );
        let up = http(&hp, req.as_bytes());
        assert!(up.starts_with("HTTP/1.1 200"), "{up}");
        let pending = aktar_pending(app.state()).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].name, "not.txt");
        assert_eq!(pending[0].size, 7);
        assert!(pending[0].path.starts_with(session_dir(&handle)));

        aktar_reject(app.state(), pending[0].id.clone()).unwrap();
        assert!(aktar_pending(app.state()).unwrap().is_empty());
        aktar_stop(app.state()).unwrap();
        assert!(aktar_status(app.state()).unwrap().is_none());
    }

    #[test]
    fn qr_renders() {
        let svg = qr_svg("http://192.168.1.2:50000/?t=00112233445566778899aabbccddeeff").unwrap();
        assert!(svg.starts_with("<?xml") || svg.starts_with("<svg"));
    }
}
