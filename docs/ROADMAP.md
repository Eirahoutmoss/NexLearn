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

## Aşama 7 — Öğrenme bilimi ve içe aktarma genişlemesi — **tamam**
- Yerel OCR (Tesseract.js, Türkçe + İngilizce; taranmış PDF ve görseller), DRM'siz EPUB.
- Sınav provası (tekrar planını değiştirmez), eminlik sorusu ve kalibrasyon raporu, karışık (interleaved) tekrar.
- Kavram haritasında hatırlama katmanı, Feynman anlatım denetimi, modelsiz (TF-IDF) kavram önerileri.

## Aşama 8 — Paylaşım ve cihazlar — **tamam**
- NexAktar: telefondan (Android/iPhone, uygulamasız) yerel ağ üzerinden dosya/fotoğraf/metin gönderme, ters yönde alma (`docs/NEXAKTAR.md`).
- `.nexpack` paketleri: çalışma grubu ve sürümlü kurumsal bilgi tabanı (`docs/NEXPACK.md`).
- Eşli öğrenme: sunucusuz meydan okuma dosyaları (`.nexduel`).
- Android uygulaması (Capacitor): paylaş menüsü, “Birlikte aç”, uygulama içi doğrulamalı APK güncellemesi.

## Aşama 9 — Zihin (isteğe bağlı yerel yapay zekâ) — **tamam**
- wllama ile cihaz üzerinde küçük dil modeli; kart önerisi, basit açıklama, anlatım değerlendirmesi. Çekirdekten bağımsız paket (`docs/ZIHIN.md`).

## Doğrulanmayı bekleyenler
- Android APK'nın gerçek bir cihazda kurulup paylaş menüsü ve güncellemenin denenmesi (APK CI'da derleniyor ve birim testleri geçiyor).
- NexAktar'ın gerçek bir Windows + telefon ağında denenmesi (sunucu uçtan uca Rust testinde ve telefon sayfası tarayıcı testinde doğrulandı).
- Zihin'in gerçek bir modelle denenmesi (motor tarayıcıda yükleniyor, görevler sahte modelle test edildi; model dosyası yayımlanınca).
- Ekran okuyucuyla (NVDA/Narrator, TalkBack) manuel kritik akış denemesi.
- Düşük kapasiteli cihazda bellek ölçümü (< 200 MB boşta).

## Sonraya bırakılanlar (bilinçli olarak)
- Kullanıcı kontrollü cihazlar arası eşitleme (revizyon tabanlı çakışma çözümü) ve birleştirmeli geri yükleme.
- Lisanslama.
- Kod imzalama (Authenticode) ve güncellemede imza doğrulaması — imza sertifikası alınınca.
- Web sayfası ve ses/video içe aktarma, kaynaklar arası karşılaştırma, eklenti mimarisi (izin modeli).
