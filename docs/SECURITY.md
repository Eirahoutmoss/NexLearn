# Güvenlik ve Gizlilik

## Gizlilik ilkeleri
- Hesap, telemetri, analitik ve reklam yoktur. Tüm veri cihazdaki IndexedDB’de durur.
- Uygulama kendiliğinden hiçbir ağ isteği yapmaz. İstekler yalnızca kullanıcı bir düğmeye bastığında olur: **Güncellemeleri denetle** (`api.github.com` + bu deponun sürüm dosyaları) ve **Zihin paketini indir** (bu deponun sürüm dosyaları). CSP `connect-src` yalnızca bunlara ve uygulamanın kendi dosyalarına izin verir.
- **NexAktar** yerel ağda, kullanıcı başlatınca açılan ve en geç 10 dakikada kapanan bir sunucudur; internete çıkmaz (`docs/NEXAKTAR.md`).
- **Zihin** modeli cihazda çalışır; metinler dışarı gönderilmez (`docs/ZIHIN.md`).
- Android'de otomatik bulut yedeği ve cihazdan cihaza aktarım kapalıdır.
- Hata günlükleri yalnızca hata kodu ve bağlam adı içerir; kaynak metni, dosya adı veya kişisel veri yazılmaz (`toAppError` hata mesaj gövdesini taşımaz; test edilmiştir).
- PDF ve yedek parolaları yalnızca işlem süresince bellekte tutulur; saklanmaz, loglanmaz.
- Tekrarda yazılan cevaplar varsayılan olarak **kaydedilmez** (Ayarlar > Gizlilik ile açılır).

## Tehdit modeli (MVP)
| Tehdit | Önlem |
|---|---|
| Kötü niyetli PDF/Markdown (script, makro, XSS) | İçerik hiçbir zaman HTML olarak işlenmez; Markdown düz metne bölütlenir ve React metin düğümü olarak çizilir. pdf.js `isEvalSupported: false`, `enableXfa: false`. CSP `script-src 'self'`. |
| Uzantı sahteciliği | Dosya türü önce sihirli baytlardan belirlenir; ikili içerikli “.txt” reddedilir. |
| Path traversal | Dosya adları yalnızca başlık/metadata olarak kullanılır, dosya sistemine yazılmaz (Blob olarak IndexedDB’de). Yedekte `..`, mutlak yol ve beklenmeyen dosyalar reddedilir. Masaüstü güncellemede dosya adı beyaz listeyle doğrulanır ve kurucu yalnız uygulamanın `updates` klasöründen çalıştırılır. |
| Aşırı büyük dosya / zip bombası | Boyut sınırları (PDF 200 MB, metin 20 MB, görsel 30 MB); ZIP içe aktarma reddedilir; yedek açarken giriş başına 600 MB ve toplam 2 GB sınırı. `fflate` güvenlik düzeltmeli sürüm (0.8.3). |
| Şifreli/bozuk içerik | Parola ayrı modalda sorulur; hata `SRC-002`; uygulama çökmez. |
| Yedek kurcalama | Manifest + her dosya için SHA-256; listelenmeyen dosya reddedilir; yapısal doğrulama; doğrulanmadan yazma yok; yazma tek işlem; öncesinde anlık görüntü. |
| CSV formül enjeksiyonu | `= + - @` ile başlayan hücreler `'` ile öneklenir. |
| Güncelleme dosyasının değiştirilmesi | Yalnız depo adresleri; HTTPS; `SHA256SUMS.txt` ile özet doğrulaması; uyuşmazlıkta dosya silinir. (Önerilen gelecek adım: kod imzalama.) |
| Harici bağlantıların otomatik açılması | İçe aktarılan içerikteki bağlantılar tıklanabilir hâle getirilmez. |
| Masaüstü IPC kötüye kullanımı | Tauri yetenekleri yalnızca `core:default`; özel komutlar (güncelleme, NexAktar, Zihin) girdileri doğrular; asset protokolü yalnızca Zihin klasörüyle sınırlı. |
| NexAktar: yetkisiz yükleme | Tek kullanımlık 128 bit anahtar (sabit süreli karşılaştırma), yalnızca özel ağ adresleri, 20 hatalı denemede kapanma, 10 dakika süre, dosya başına onay, ad temizleme, boyut ve adet sınırları, sıkı CSP'li telefon sayfası. Bilinen sınır: yerel ağda HTTP (bkz. NEXAKTAR.md). |
| Paylaşım paketi / meydan okuma dosyası kurcalama | `.nexpack`: içerik ve dosya SHA-256 özetleri, güvenli yol beyaz listesi, yapısal doğrulama, kayıt sınırı; kişisel veri pakete girmez. `.nexduel`: yapı ve uzunluk doğrulaması, puan dosyadan değil cevaplardan yeniden hesaplanır. |
| Zihin model dosyası | Yalnızca bu deponun sürüm adresleri; manifestteki boyut ve SHA-256 ile doğrulama; model WebAssembly kum havuzunda çalışır; çıktılar hiçbir zaman HTML olarak işlenmez ve kullanıcı onayı olmadan kaydedilmez. |
| Antivirüs yanlış alarmları | Paketleyici/şifreleyici (UPX vb.) yok, gizleme yok, kalıcı hizmet, otomatik başlatma, klavye/sistem kancası yok; güncellemeler `%TEMP%` yerine uygulama klasöründen çalıştırılır. Kesin çözüm: kod imzalama (bkz. RELEASING.md). |
| Android: zararlı paylaşım | Paylaşılan dosyalar önbelleğe kopyalanıp aynı içe aktarma doğrulamalarından geçer; FileProvider yalnızca güncelleme klasörünü açar; açık metin (HTTP) trafiği kapalı. |

## Açık bildirimi
Bir güvenlik açığı bulursan lütfen herkese açık issue yerine GitHub “Security advisories” (özel bildirim) üzerinden bildir.
