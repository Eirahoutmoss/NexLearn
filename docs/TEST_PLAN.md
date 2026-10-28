# Test Planı ve Sonuçlar

## Nasıl çalıştırılır
```bash
npm test                                         # Vitest: birim + entegrasyon (fake-indexeddb)
npm run build && npx playwright test             # Playwright: uçtan uca, axe, çevrimdışı, performans
cargo test --manifest-path src-tauri/Cargo.toml  # Rust: güncelleme komutu yardımcıları
```
CI (`.github/workflows/ci.yml`) bunların hepsini her push/PR’da çalıştırır; ayrıca `npm audit --omit=dev`.

## Son yerel çalıştırma (2026-10-29)
| Komut | Sonuç |
|---|---|
| `npm run typecheck` | hatasız |
| `npm run lint` | hatasız |
| `npm test` | **111/111** test geçti (10 dosya) |
| `npm run build` | başarılı; PWA precache 52 dosya |
| `npx playwright test` | **20/20** geçti (art arda 2 çalıştırmada kararlı) |
| `cargo test` / `cargo clippy -D warnings` | 2/2 geçti / uyarısız |
| `npm audit --omit=dev` | 0 açık (fflate 0.8.3’e yükseltildi) |
| GitHub Actions CI (`80dd67f`) | Web, Rust ve **Windows paketi (NSIS + MSI)** işleri başarılı; kurulum dosyaları artifact olarak üretildi |

## Birim testleri (Vitest)
- **Zamanlayıcı** (`scheduler.test.ts`): ilk/ikinci/üçüncü başarı, unutma, ease alt sınırı, maxInterval, determinizm, geçersiz puan, UTC, düğme eşlemesi, gerekçe.
- **İlişki kuralları**: kendine ilişki, yineleme (yönsüz türler), ön koşul döngüsü, silinmiş kayıtlar, güncelleme istisnası.
- **Metin/konum/hata**: Türkçe normalleştirme (İ/ı, ş, ğ, ç, ö, ü), kelime sayımı, anlamsız içerik, güvenli başlık (yol bileşenleri), konum çözümleme (sayfa, ofset, çözülemeyen), hata eşlemesinde içerik sızmaması.
- **Bölütleme**: düz metin ofsetleri, Markdown türleri ve başlık yolu, HTML’nin yorumlanmaması, PDF satır→paragraf, tireleme, sihirli bayt tespiti, ZIP reddi, boyut sınırları, Windows-1254.
- **Tema kontrastı** (`themes.test.ts`, 31 test): 6 tema × 5 renk tonu için metin/soluk metin/vurgu metni ≥ 4.5:1, odak ve UI bileşenleri ≥ 3:1, vurgu arka planları üzerinde metin ≥ 4.5:1.
- **Çeviri** (`i18n.test.ts`): koddaki tüm anahtarlar ve dinamik aileler TR ve EN’de mevcut; çoğul ve parametreler.
- **Harita yerleşimi / vurgu parçalama**: determinizm, sabit düğüm, 200 düğüm < 1 sn, yön gezinmesi, çakışan vurgular.

## Entegrasyon testleri (Vitest + fake-indexeddb)
- Kaynak → segment → vurgu (çok segmentli) → not → yer imi → kart → tekrar olayı.
- Yineleme sorusu (otomatik silme yok), boş içerik, desteklenmeyen/arşiv dosyaları, iptal → kısmi → yeniden deneme, kapanma sonrası kurtarma.
- Not kaynağı düzenlemede segment kimliklerinin korunması; çöp kutusu ve kalıcı silmede kartların korunması.
- Kavram silmede ilişkilerin kontrollü silinmesi ve kart/görev bağlarının kaldırılması; görev denemeleri.
- Ayarların sınırlandırılması; revizyon çakışması (DB-003).
- **Yedek**: ZIP gidiş-dönüş (kayıt kayıt eşitlik + orijinal dosya), JSON gidiş-dönüş, şifreli yedek (doğru/yanlış parola), kurcalanmış sağlama toplamı, yol manipülasyonu, listelenmemiş dosya, yapısal bozukluk, sürüm uyumu (yeni major red, yeni minor kabul), geri yükleme geri alma, bozuk girdiler.
- Metrikler: anlık / 1+ gün / 1+ hafta ayrımı, okuma dakikaları, zor kartlar, CSV kaçışları, arama.

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
