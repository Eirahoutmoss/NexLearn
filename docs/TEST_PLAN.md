# Test Planı ve Sonuçlar

## Nasıl çalıştırılır
```bash
npm test                                         # Vitest: birim + entegrasyon (fake-indexeddb)
npm run build && npx playwright test             # Playwright: uçtan uca, axe, çevrimdışı, performans
cargo test --manifest-path src-tauri/Cargo.toml  # Rust: güncelleme komutu yardımcıları
```
CI (`.github/workflows/ci.yml`) bunların hepsini her push/PR’da çalıştırır; ayrıca `npm audit --omit=dev`.

## Son yerel çalıştırma (2026-10-29, 0.2.0)
| Komut | Sonuç |
|---|---|
| `npm run typecheck` | hatasız |
| `npm run lint` | hatasız |
| `npm test` | **140/140** test geçti (19 dosya) |
| `npm run build` | başarılı; PWA precache 58 dosya (OCR ve Zihin dosyaları ön önbelleğe alınmaz) |
| `npx playwright test` | **28/28** geçti |
| `cargo test` / `cargo clippy -D warnings` | 9/9 geçti (NexAktar uçtan uca HTTP testi dahil) / uyarısız |
| `npm audit --omit=dev` | 0 açık |
| GitHub Actions CI | Web, Rust, **Windows paketi (NSIS + MSI)** ve **Android (Java birim testleri + APK)** işleri başarılı |

## Birim testleri (Vitest)
- **Zamanlayıcı** (`scheduler.test.ts`): ilk/ikinci/üçüncü başarı, unutma, ease alt sınırı, maxInterval, determinizm, geçersiz puan, UTC, düğme eşlemesi, gerekçe.
- **İlişki kuralları**: kendine ilişki, yineleme (yönsüz türler), ön koşul döngüsü, silinmiş kayıtlar, güncelleme istisnası.
- **Metin/konum/hata**: Türkçe normalleştirme (İ/ı, ş, ğ, ç, ö, ü), kelime sayımı, anlamsız içerik, güvenli başlık (yol bileşenleri), konum çözümleme (sayfa, ofset, çözülemeyen), hata eşlemesinde içerik sızmaması.
- **Bölütleme**: düz metin ofsetleri, Markdown türleri ve başlık yolu, HTML’nin yorumlanmaması, PDF satır→paragraf, tireleme, sihirli bayt tespiti, ZIP reddi, boyut sınırları, Windows-1254.
- **Tema kontrastı** (`themes.test.ts`, 31 test): 6 tema × 5 renk tonu için metin/soluk metin/vurgu metni ≥ 4.5:1, odak ve UI bileşenleri ≥ 3:1, vurgu arka planları üzerinde metin ≥ 4.5:1.
- **Çeviri** (`i18n.test.ts`): koddaki tüm anahtarlar ve dinamik aileler TR ve EN’de mevcut; çoğul ve parametreler.
- **Harita yerleşimi / vurgu parçalama**: determinizm, sabit düğüm, 200 düğüm < 1 sn, yön gezinmesi, çakışan vurgular.
- **Öğrenme bilimi** (`learning.test.ts`, `practice.test.ts`): karıştırma (karşıt kavramlar), kalibrasyon, Feynman terim kapsamı, kavram gücü, prova seti ve puanı.
- **Kavram önerileri** (`keywords.test.ts`): TF-IDF, başlık ağırlığı, iki kelimelik terimler, Türkçe kök gruplama.
- **EPUB** (`epub.test.ts`): spine sırası, varlık çözümleme, DRM reddi, boyut sınırları. **OCR** (`ocr.test.ts`): metinden segment üretimi.
- **Güncelleme** (`update.test.ts`): yalnızca depo adresleri, kurucu/MSI/APK seçimi, uygulama dışı etiketlerin ve ön sürümlerin atlanması.
- **Zihin** (`tasks.test.ts`): manifest doğrulama (yalnız depo adresleri, özet biçimi, yol), kart önerisi doğrulama (tekrar, boş, kaynakta geçmeyen cevap), JSON ayıklama, sahte sağlayıcıyla uçtan uca.
- **Eşli öğrenme** (`duel.test.ts`): meydan okuma → cevap → karşılaştırma; puanın cevaplardan yeniden hesaplanması; bozuk dosya reddi.

## Entegrasyon testleri (Vitest + fake-indexeddb)
- Kaynak → segment → vurgu (çok segmentli) → not → yer imi → kart → tekrar olayı.
- Yineleme sorusu (otomatik silme yok), boş içerik, desteklenmeyen/arşiv dosyaları, iptal → kısmi → yeniden deneme, kapanma sonrası kurtarma.
- Not kaynağı düzenlemede segment kimliklerinin korunması; çöp kutusu ve kalıcı silmede kartların korunması.
- Kavram silmede ilişkilerin kontrollü silinmesi ve kart/görev bağlarının kaldırılması; görev denemeleri.
- Ayarların sınırlandırılması; revizyon çakışması (DB-003).
- **Yedek**: ZIP gidiş-dönüş (kayıt kayıt eşitlik + orijinal dosya), JSON gidiş-dönüş, şifreli yedek (doğru/yanlış parola), kurcalanmış sağlama toplamı, yol manipülasyonu, listelenmemiş dosya, yapısal bozukluk, sürüm uyumu (yeni major red, yeni minor kabul), geri yükleme geri alma, bozuk girdiler.
- Metrikler: anlık / 1+ gün / 1+ hafta ayrımı, okuma dakikaları, zor kartlar, CSV kaçışları, arama.
- **Paylaşım paketi** (`pack.test.ts`): dışa aktar → içe aktar (kimlik eşleme, kişisel veri sızmaması, orijinal dosya), kurumsal güncelleme (içerik yenilenir, kişisel plan ve vurgular korunur, çıkarılanlar çöpe), kurcalama/yol/biçim sürümü reddi.

## Rust (`cargo test`)
- Güncelleme: dosya adı kuralları, SHA256SUMS ayrıştırma, kurulum türü (MSI/NSIS) tespiti.
- NexAktar: özel ağ aralıkları, dosya adı temizleme, yüzde kod çözme, sabit süreli karşılaştırma, QR üretimi ve **gerçek HTTP ile uçtan uca oturum** (sayfa + CSP, yanlış anahtar reddi, yükleme, bekleme klasörü, reddetme, kapatma).
- Zihin: dosya adı kuralları.

## Android (`./gradlew test…UnitTest`)
- Paylaşılan dosya adı temizleme, APK adı doğrulama, SHA256SUMS ayrıştırma.

## Uçtan uca (Playwright, Chromium)
| Test | Kapsam |
|---|---|
| ilk açılış | Tanıtım, hesap/e-posta istenmemesi, boş durum, kalıcılık |
| dikey dilim | İçe aktar → oku → vurgula → not → kart (cevap seçimle dolu, kaynak görünür) → yeniden yükle → tekrar → gerekçe → geçmiş |
| klavye | J/K paragraf gezinmesi, N ile not, Enter ile eylem menüsü, Esc |
| komut paleti | Ctrl+K, “cigdem ogrenciler” → “Çiğdem öğrenciler” sonucuna gitme |
| hatalı dosyalar | ZIP, desteklenmeyen tür, boş dosya mesajları |
| kavram haritası | Kavram, ilişki, döngü reddi, liste ve harita görünümü |
| PDF | Sayfa işaretleri, kaynaklı kartta sayfa no, sayfa görünümü tuvali |
| taranmış PDF | SRC-003 uyarısı |
| şifreli PDF | Parola modalı, yanlış/doğru parola (qpdf ile üretilen fikstür) |
| yineleme | Aynı dosya sorusu, reddedince eklenmemesi |
| yedek | Oluştur (indir) → JSON dışa aktarma → tümünü sil (yazarak onay) → geri yükle → doğrulama; bozuk yedek reddi |
| şifreli yedek | Yanlış parola reddi, doğru parola ile önizleme |
| çevrimdışı | Service worker kontrolü, ağ kapalıyken yeniden yükleme, metin ekleme, kart, tekrar |
| erişilebilirlik ×3 | axe (WCAG 2.0/2.1/2.2 A–AA) 11 rota + okuma alanı; Aydınlık, Gece ve Yüksek Kontrast temalarında **0 ihlal** |
| duyarlı düzen | 390 px ve %200 yakınlaştırma eşdeğeri (683 px): 6 rotada yatay taşma yok |
| odak yönetimi | Atlama bağlantısı, modalda odak ve Esc |
| performans | Soğuk açılış (ölçülen ~0,5 sn, bütçe 2 sn); 100 sayfalık PDF içe aktarma (ölçülen ~2,5 sn, bütçe 10 sn) |
| EPUB | Bölümler başlık olarak, kitap adı kaynak adı olarak |
| kavram önerileri + prova | Öneriden kavram ekleme; prova akışı; tekrar planının değişmediği |
| eminlik | Ayardan açma, cevap öncesi eminlik, “emin olup yanlış” raporu |
| OCR | Tarayıcıda üretilen yazılı görselden metnin cihazda tanınması ve OCR uyarısı |
| eşli öğrenme | İki ayrı tarayıcı bağlamında meydan okuma → çözme → cevap dosyası → karşılaştırma tablosu |
| Zihin | Dosya doğrulama, geçersiz modelin güvenle reddi (motor tarayıcıda gerçekten yüklenir), dosyaları silme |
| paylaşım paketi | Dışa aktar (indir) → içe aktar → rozet; aynı sürümün tanınması |
| NexAktar telefon sayfası | Dosya ve metin yükleme, kalan süre, bilgisayardan dosya listesi (ağ isteği yakalanarak) |

## Performans bütçeleri
| İşlem | Bütçe | Durum |
|---|---|---|
| Soğuk açılış (masaüstü) | < 2 sn | e2e ölçümü ~0,5 sn |
| 100 sayfa PDF içe aktarma | < 10 sn | e2e ölçümü ~2,5 sn |
| Arama (10k segment) | < 100 ms | birim testi |
| Harita yerleşimi (200 düğüm) | < 1 sn | birim testi |
| Yedek (10k kart) | < 5 sn | birim testi |
| Tekrar kaydı | < 50 ms | ölçülmedi (tek IndexedDB işlemi) |
| Boşta bellek | < 200 MB | **ölçülmedi** |

## Manuel doğrulama gerekenler (otomatikleştirilmedi)
- Ekran okuyucu (NVDA / Windows Ekran Okuyucusu) ile: içe aktar → oku → kart → tekrar akışı.
- Windows’ta kurulum, ilk açılış, `v*` sürümüyle uygulama içi güncelleme.
- Dokunmatik cihazda metin seçimi ve araç çubuğu.

## Test verisi
Tüm fikstürler sentetiktir (pdf-lib ile üretilen PDF’ler, test içi metinler, `src/sample/sample.ts`). Gerçek kullanıcı belgeleri kullanılmaz.
