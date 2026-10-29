# NexLearn

**Oku · Anla · Hatırla · Uygula** — ücretsiz, reklamsız, hesapsız ve yerel öncelikli öğrenme uygulaması.

NexLearn; kaynak okuma (NexRead), aktif hatırlama ve aralıklı tekrar (NexMemory) ile kavram haritası ve uygulama görevlerini (NexÖğren) tek bir yerel veri modelinde birleştirir. Her modül tek başına da kullanılabilir. Verilerin cihazında kalır; istediğin an açık biçimlerde dışa aktarabilir ve yedekleyebilirsin.

> Ürün kapsamı: [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) · Görsel konsept: [`docs/assets/concept-board.png`](docs/assets/concept-board.png)

## Özellikler (0.2.0)

- **Kaynaklar:** PDF, EPUB (DRM'siz), TXT, Markdown, yapıştırılan metin, kendi notların ve görseller; taranmış sayfalar için cihaz üzerinde OCR (Türkçe/İngilizce). Orijinal dosya değiştirilmeden saklanır, SHA-256 ile yinelenen dosya tespiti (otomatik silme yok), şifreli PDF için parola sorma, ilerleme ve iptal, yarım kalan içe aktarmayı yeniden deneme.
- **NexRead:** okuma konumu ve ilerlemesi, beş adlandırılmış renkle vurgu, not, alıntı, yer imi, “kendi cümlelerinle açıkla”, belge içi arama, PDF için orijinal sayfa görünümü, yazı tipi/boyut/satır aralığı/satır genişliği ayarı, satır rehberi, odak modu, oturum süresi.
- **NexMemory:** manuel ve kaynaktan oluşturulan kartlar, belgelenmiş deterministik SM-2 türevi algoritma (`sm2-v1`), her tekrardan sonra gerekçe, kart geçmişi, askıya alma, çöp kutusu, kart kalite uyarıları.
- **NexÖğren:** kavramlar, türlü ilişkiler (ön koşul, parça, örnek, karşıt, destekler, ilişkili), döngü/yineleme kuralları, klavyeyle gezilebilen harita + erişilebilir liste görünümü, kavramdan karta ve göreve geçiş, yönlendirici sorular, uygulama görevleri ve öz değerlendirme.
- **Öğrenme bilimi:** tekrar planını bozmayan sınav provası, cevap öncesi eminlik ve kalibrasyon raporu, karışık (interleaved) tekrar, haritada hatırlama katmanı, Feynman anlatım denetimi, modelsiz kavram önerileri.
- **Paylaşım:** telefondan QR kodla yerel ağ üzerinden gönderme (**NexAktar**), `.nexpack` çalışma grubu ve sürümlü kurumsal bilgi tabanı paketleri, sunucusuz eşli öğrenme (meydan okuma dosyaları).
- **Zihin (isteğe bağlı):** ayrı program kurmadan, tamamen cihazda çalışan küçük dil modeliyle kart önerisi, basit açıklama ve anlatım değerlendirmesi. Çekirdeğin parçası değildir.
- **İlerleme:** okuma, hatırlama (anlık / 1+ gün / 1+ hafta) ve uygulama **ayrı ayrı**; zor kartlar; Markdown öğrenme raporu. Hepsi cihazda hesaplanır.
- **Veri:** JSON, Markdown ve CSV dışa aktarma; doğrulanan ZIP yedek (manifest + SHA-256), isteğe bağlı AES-256 şifreleme, geri yükleme öncesi otomatik anlık görüntü ve geri alma.
- **Deneyim:** 6 tema (Aydınlık Odak, Sıcak Doğal, Yumuşak Pastel, Gece Rahat, Ametist Odak, Yüksek Kontrast) + sistem, renk tonu seçimi, Türkçe/İngilizce arayüz, komut paleti (Ctrl+K), özelleştirilebilir kısayollar, çevrimdışı çalışma (PWA), isteğe bağlı günlük hedefler (seri/streak yok).
- **Platformlar:** Windows (Tauri), Android (Capacitor; paylaş menüsü ve “Birlikte aç” desteği), web/PWA.
- **Güncelleme:** Ayarlar > Hakkında’daki düğmeyle GitHub’daki son sürüm denetlenir; Windows'ta kurulum dosyası, Android'de APK SHA-256 ile doğrulanarak indirilir ve kurulur. Uygulama kendiliğinden internete bağlanmaz.

## Çalıştırma

Gereksinimler: Node.js 22+, (masaüstü için) Rust stable ve Windows’ta WebView2.

```bash
npm ci
npm run dev          # http://localhost:5173 (web)
npm run build        # dist/ (PWA)
npm run preview      # derlenmiş sürümü 4173’te sun
npm run tauri dev    # masaüstü (Tauri) geliştirme
npm run tauri build  # Windows kurulum dosyaları (NSIS .exe + .msi)
npm run android:sync # Android projesini güncelle (ardından android/ içinde ./gradlew assembleDebug)
```

## Kontroller

```bash
npm run typecheck && npm run lint && npm test   # tip, lint, birim + entegrasyon
npm run build && npx playwright test             # uçtan uca, erişilebilirlik (axe), çevrimdışı, performans
cargo test --manifest-path src-tauri/Cargo.toml  # masaüstü komutları (güncelleme, NexAktar, Zihin)
(cd android && ./gradlew testDebugUnitTest)      # Android yerel kod testleri
```

## Belgeler

| Belge | İçerik |
|---|---|
| [PRODUCT_SPEC](docs/PRODUCT_SPEC.md) | Kapsam, kullanıcı hikâyeleri, bilinen sınırlamalar |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Katmanlar, modüller, sözleşmeler |
| [DATA_MODEL](docs/DATA_MODEL.md) | Şema, göçler, yedek ve dışa aktarma biçimi |
| [DECISIONS](docs/DECISIONS.md) | Mimari karar kayıtları (ADR) |
| [ROADMAP](docs/ROADMAP.md) | Aşamalar ve tamamlanma durumu |
| [TEST_PLAN](docs/TEST_PLAN.md) | Test stratejisi ve gerçek sonuçlar |
| [SECURITY](docs/SECURITY.md) | Tehdit modeli ve gizlilik |
| [NEXAKTAR](docs/NEXAKTAR.md) · [NEXPACK](docs/NEXPACK.md) · [ZIHIN](docs/ZIHIN.md) | Telefondan aktarım protokolü, paylaşım paketi biçimi, yerel yapay zekâ |
| [RELEASING](docs/RELEASING.md) | Sürüm süreci |
| [THIRD_PARTY](docs/THIRD_PARTY.md) | Üçüncü taraf lisansları |
| [DEVELOPMENT](docs/DEVELOPMENT.md) · [CHANGELOG](docs/CHANGELOG.md) | Geliştirme notları ve sürüm notları |

## Geliştirici

Hasan Güler · [github.com/Eirahoutmoss](https://github.com/Eirahoutmoss)

Bu proje dış katkı (pull request) kabul etmez; hata ve öneriler için Issues kullanılabilir.

## Lisans

Kaynak kod: [MPL-2.0](LICENSE). Örnek içerik (deneme modu metni): CC BY 4.0. “NexLearn” adı ve logosu Hasan Güler’e aittir.
