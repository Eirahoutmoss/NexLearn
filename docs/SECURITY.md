# Güvenlik ve Gizlilik

## Gizlilik ilkeleri
- Hesap, telemetri, analitik ve reklam yoktur. Tüm veri cihazdaki IndexedDB’de durur.
- Uygulamanın yaptığı tek ağ isteği, kullanıcı **“Güncellemeleri denetle”** düğmesine bastığında `api.github.com` (sürüm bilgisi) ve masaüstünde `github.com/Eirahoutmoss/NexLearn/releases/download/…` (kurulum dosyası) adreslerine gider. CSP `connect-src` yalnızca bunlara izin verir.
- Hata günlükleri yalnızca hata kodu ve bağlam adı içerir; kaynak metni, dosya adı veya kişisel veri yazılmaz (`toAppError` hata mesaj gövdesini taşımaz; test edilmiştir).
- PDF ve yedek parolaları yalnızca işlem süresince bellekte tutulur; saklanmaz, loglanmaz.
- Tekrarda yazılan cevaplar varsayılan olarak **kaydedilmez** (Ayarlar > Gizlilik ile açılır).

## Tehdit modeli (MVP)
| Tehdit | Önlem |
|---|---|
| Kötü niyetli PDF/Markdown (script, makro, XSS) | İçerik hiçbir zaman HTML olarak işlenmez; Markdown düz metne bölütlenir ve React metin düğümü olarak çizilir. pdf.js `isEvalSupported: false`, `enableXfa: false`. CSP `script-src 'self'`. |
| Uzantı sahteciliği | Dosya türü önce sihirli baytlardan belirlenir; ikili içerikli “.txt” reddedilir. |
| Path traversal | Dosya adları yalnızca başlık/metadata olarak kullanılır, dosya sistemine yazılmaz (Blob olarak IndexedDB’de). Yedekte `..`, mutlak yol ve beklenmeyen dosyalar reddedilir. Masaüstü güncellemede dosya adı beyaz listeyle doğrulanır ve kurucu yalnız geçici güncelleme klasöründen çalıştırılır. |
| Aşırı büyük dosya / zip bombası | Boyut sınırları (PDF 200 MB, metin 20 MB, görsel 30 MB); ZIP içe aktarma reddedilir; yedek açarken giriş başına 600 MB ve toplam 2 GB sınırı. `fflate` güvenlik düzeltmeli sürüm (0.8.3). |
| Şifreli/bozuk içerik | Parola ayrı modalda sorulur; hata `SRC-002`; uygulama çökmez. |
| Yedek kurcalama | Manifest + her dosya için SHA-256; listelenmeyen dosya reddedilir; yapısal doğrulama; doğrulanmadan yazma yok; yazma tek işlem; öncesinde anlık görüntü. |
| CSV formül enjeksiyonu | `= + - @` ile başlayan hücreler `'` ile öneklenir. |
| Güncelleme dosyasının değiştirilmesi | Yalnız depo adresleri; HTTPS; `SHA256SUMS.txt` ile özet doğrulaması; uyuşmazlıkta dosya silinir. (Önerilen gelecek adım: kod imzalama.) |
| Harici bağlantıların otomatik açılması | İçe aktarılan içerikteki bağlantılar tıklanabilir hâle getirilmez. |
| Masaüstü IPC kötüye kullanımı | Tauri yetenekleri yalnızca `core:default`; özel komutlar yalnızca güncelleme için ve girdileri doğrulanır. |

## Açık bildirimi
Bir güvenlik açığı bulursan lütfen herkese açık issue yerine GitHub “Security advisories” (özel bildirim) üzerinden bildir.
