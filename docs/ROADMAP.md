# Yol Haritası ve Durum

Durum işaretleri yalnızca **çalıştırılmış testlerle doğrulanmış** işler için “tamam” olarak verilmiştir.

## Aşama 0 — Depo denetimi ve iskelet — **tamam**
- Boş depo; Vite + React 19 + TypeScript (strict) + ESLint + Vitest + Playwright kuruldu. CI (`.github/workflows/ci.yml`) ve Windows sürüm iş akışı (`release.yml`) eklendi.

## Aşama 1 — Veri çekirdeği — **tamam**
- Domain türleri, IndexedDB şeması ve göç yapısı, genel depo (yumuşak silme, revizyon/çakışma), hata taksonomisi, değişiklik yayını (sekmeler arası).

## Aşama 2 — İçe aktarma ve NexRead — **tamam**
- PDF (sayfa/ofset), TXT (UTF-8 / Windows-1254), Markdown (başlık yolu), yapıştırma, not; yineleme tespiti, parola, ilerleme, iptal, yeniden deneme, kesilen içe aktarmayı kurtarma.
- Okuma: konum kalıcılığı, vurgu (çok segmentli), not, alıntı, yer imi, açıklama, belge içi arama, sayfa görünümü, tipografi, satır rehberi, odak modu, oturum süresi, klavyeyle tam kullanım.

## Aşama 3 — NexMemory — **tamam**
- Kart CRUD, kalite uyarıları, kuyruk, `sm2-v1`, gerekçe, geçmiş, askı, çöp kutusu/kalıcı silme.

## Aşama 4 — NexÖğren — **tamam**
- Kavram/ilişki CRUD, kurallar (kendine ilişki, yineleme, döngü), harita (sürükle, yakınlaştır, klavye) + liste görünümü, kavramdan karta/göreve, yönlendirici sorular, kontrollü silme.

## Aşama 5 — Birleşik akış — **tamam**
- Ana sayfa (devam, bugünkü tekrar, son kaynaklar, isteğe bağlı hedefler), ilerleme ekranı (ayrı metrikler), FTUE + sentetik örnek içerik, komut paleti.

## Aşama 6 — Dışa aktarma, geri yükleme, sağlamlaştırma — **tamam**
- JSON/Markdown/CSV, ZIP yedek + şifreleme, doğrulama, geri yükleme + geri alma, tüm veriyi silme; PWA çevrimdışı; axe erişilebilirlik testleri; performans bütçe testleri; temalar; TR/EN; düğmeyle güncelleme (masaüstü + PWA).

## Doğrulanmayı bekleyenler
- Windows kurulum paketinin gerçek bir Windows makinede kurulup güncellemenin uçtan uca denenmesi (paket CI’da Windows’ta başarıyla derleniyor; kurulum ve güncelleme akışı gerçek bir Windows makinede henüz denenmedi).
- Ekran okuyucuyla (NVDA/Narrator) manuel kritik akış denemesi.
- Düşük kapasiteli cihazda bellek ölçümü (< 200 MB boşta).

## Aşama 7 — İleri özellikler (planlı)
- Yerel OCR (Tesseract.js), EPUB ve web sayfası içe aktarma, ses/video transkripsiyonu.
- İsteğe bağlı model sağlayıcısı (varsayılan kapalı, şema doğrulamalı, provenance’lı öneriler).
- Kullanıcı kontrollü cihazlar arası senkronizasyon (revizyon tabanlı çakışma çözümü) ve birleştirmeli geri yükleme.
- Android (Capacitor) paketi.
- Kod imzalama (Authenticode) ve güncellemede imza doğrulaması.
- Kaynaklar arası karşılaştırma, gelişmiş haritalar (katmanlar), eklenti mimarisi (izin modeli).
