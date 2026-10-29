# Mimari Karar Kayıtları (ADR)

Biçim: Başlık · Tarih · Durum · Bağlam · Seçenekler · Karar · Sonuçlar

## ADR-001 Teknoloji yığını ve platformlar
- **Tarih:** 2026-10-29 · **Durum:** Kabul
- **Bağlam:** Depo boştu. Şartname React+TS, PWA, Tauri (Windows), Capacitor (Android) öneriyor. Nex ailesindeki diğer masaüstü uygulamaları Go + WebView2 ile tek exe.
- **Seçenekler:** (a) React+TS + Tauri 2, (b) React+TS + Go/WebView2 kabuğu, (c) yalnızca web/PWA.
- **Karar:** (a). Arayüz React 19 + TypeScript + Vite; aynı kod web/PWA ve Tauri 2 ile Windows’ta çalışır. Android (Capacitor) sonraki aşama.
- **Sonuçlar:** Tauri de WebView2 kullanır ve NSIS/MSI kurulumunu, güvenli IPC izin modelini hazır sunar; Go kabuğuna göre daha az özel kod. Windows paketi GitHub Actions’ta üretilir (Linux’tan çapraz derleme yapılmaz).

## ADR-002 Yerel depolama: tüm platformlarda IndexedDB
- **Tarih:** 2026-10-29 · **Durum:** Kabul
- **Bağlam:** Şartname masaüstü/mobilde SQLite, tarayıcıda IndexedDB öneriyor.
- **Seçenekler:** (a) yalnız IndexedDB, (b) SQLite (Tauri eklentisi) + IndexedDB, (c) wasm-SQLite.
- **Karar:** (a) — `idb` (ISC) ile. Tauri’nin WebView2’si IndexedDB’yi kalıcı uygulama veri klasöründe tutar.
- **Sonuçlar:** Tek veri katmanı ve tek test yüzeyi; çok depolu işlemler atomik. FTS5 yerine bellek içi arama (ADR-003). İleride SQLite gerekirse depolama adaptörü değiştirilir; yedek biçimi platformdan bağımsızdır. Risk: WebView2 veri klasörü silinirse veri gider → yedekleme vurgulanır.

## ADR-003 Arama
- **Karar:** Bağımlılıksız bellek içi dizin; Türkçe büyük/küçük harf ve aksan katlama (İ/ı, ş/s, ğ/g…). 10k segmentte < 100 ms (birim testi). Arama paleti açıldığında dizin kurulur.

## ADR-004 PDF işleme ve okuma görünümü
- **Karar:** `pdfjs-dist` 4.10 (Apache-2.0), kendi worker’ında, `isEvalSupported: false`. Metin satırlardan dikey boşluğa göre paragraflara bölünür, satır sonu tirelemesi birleştirilir, sayfa numarası ve ofsetler korunur. Okuma alanı varsayılan **metin görünümü** (tipografi ayarları için), PDF’lerde **sayfa görünümü** ek seçenek.
- **Sonuçlar:** Taranmış PDF’ler `SRC-003` (“OCR sonraki sürümde”) ile işaretlenir, sayfa görünümünde okunabilir.

## ADR-005 Tekrar algoritması ve düğme eşlemesi
- **Karar:** Ek A’daki SM-2 türevi aynen (`sm2-v1`); konseptteki 4 düğme → puan: Tekrar=1, Zor=3, Normal=4, Kolay=5. Kolaylık 4 ondalığa yuvarlanır; aralık ≥ 1 gün.
- **Sonuçlar:** Şartnameye sadakat gereği ilk tekrarda “Kolay” da 1 gün verir (round(1 × 1.3) = 1); ikinci başarıda Kolay 8 gün (round(6 × 1.3)). Unutulan kart aynı oturumda en fazla 2 kez yeniden sorulur ve her deneme kaydedilir.

## ADR-006 Lisans
- **Seçenekler:** AGPL-3.0, MPL-2.0.
- **Karar:** Kaynak kod **MPL-2.0**; örnek içerik CC BY 4.0; “NexLearn” adı/logosu korunur.
- **Gerekçe:** Yerel uygulamada AGPL’in ağ maddesi pratik fayda sağlamaz; MPL dosya düzeyinde copyleft ile iyileştirmelerin açık kalmasını sağlar, Nex ailesinin diğer bileşenleriyle birlikte dağıtımı kolaylaştırır.

## ADR-007 Güncelleme mekanizması
- **Bağlam:** Nex ailesi kuralı: düğmeyle GitHub’daki son sürümü denetle, uygulama içinden indir ve kur. Şartname: otomatik ağ trafiği yok.
- **Seçenekler:** (a) `tauri-plugin-updater` (imza anahtarı + gizli anahtar yönetimi), (b) kendi Rust komutları + `SHA256SUMS.txt`.
- **Karar:** (b). `download_update` yalnızca bu deponun `releases/download/` adreslerini kabul eder, dosya adını doğrular, boyutu sınırlar, SHA-256’yı karşılaştırır; `install_update` yalnız geçici güncelleme klasöründeki kurucuyu çalıştırır. NSIS `currentUser` kurulumu sayesinde yönetici izni gerekmez. Web/PWA’da service worker yeni sürümü sorar (otomatik yenileme yok).
- **Sonuçlar:** Bütünlük HTTPS + SHA256SUMS ile sağlanır; özgünlük için ileride Authenticode imzası veya minisign önerilir (bkz. ROADMAP).

## ADR-008 Yedek biçimi ve şifreleme
- **Karar:** ZIP (`fflate`, MIT) + manifest + `checksums.sha256`. Şifreleme WebCrypto: PBKDF2-SHA256 (600.000) + AES-256-GCM. Argon2id ek wasm bağımlılığı gerektireceği için ertelendi.

## ADR-009 Görsel kimlik ve konsept uyarlaması
- **Karar:** Konsept panosu referans; manzara ve tema önizlemeleri tema token’larından üretilen özgün SVG; logo vektör olarak yeniden çizildi (beş yaprak + güneş). Tüm renk çiftleri `themes.test.ts` ile WCAG AA’ya göre doğrulanır. Profil/avatar, kamera/mikrofon simgeleri ve seri mekaniği kaldırıldı; Yüksek Kontrast teması eklendi.

## ADR-010 Geri yükleme modu
- **Karar:** MVP’de yalnızca “değiştir”; öncesinde otomatik anlık görüntü + “Son geri yüklemeyi geri al”. Birleştirme (çakışma çözümüyle) senkronizasyonla birlikte ele alınacak.

## ADR-011 Yönlendirme ve durum
- **Karar:** Kendi hash yönlendiricisi (dosya/Tauri/PWA’da sorunsuz) ve `useQuery` + depo değişiklik yayını; harici yönlendirici/durum kütüphanesi yok.

## ADR-012 Uluslararasılaştırma
- **Karar:** Kendi sözlük katmanı; Türkçe kaynak, İngilizce tam çeviri; çoğul için `Intl.PluralRules`; eksik anahtarlar EN → TR’ye düşer ve geliştirme modunda bildirilir. Test, koddaki tüm anahtarların iki dilde de bulunduğunu doğrular.

## ADR-013 Katkı politikası
- **Karar:** Proje tek geliştiricilidir (Hasan Güler); dış katkı kabul edilmez. Kaynak kod MPL-2.0 ile açık kalır, hata bildirimleri Issues üzerinden alınır.

## ADR-014 Yazı tipleri
- **Karar:** Inter (arayüz), Literata (okuma), Atkinson Hyperlegible, OpenDyslexic — Fontsource (OFL) ile uygulamaya gömülü; Literata/Atkinson için yalnızca Latin + Latin Genişletilmiş alt kümeleri (Türkçe karakterler) paketlenir. Harici font CDN’i yok.
