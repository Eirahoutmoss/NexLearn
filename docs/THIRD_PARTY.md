# Üçüncü Taraf Bileşenler

Dağıtıma giren (çalışma zamanı) bileşenler ve lisansları. Lisans metinleri ilgili paketlerin içinde dağıtılır.

## Web / ön yüz
| Paket | Sürüm | Lisans |
|---|---|---|
| react, react-dom | 19.1.1 | MIT |
| pdfjs-dist (pdf.js) | 4.10.38 | Apache-2.0 |
| idb | 8.0.3 | ISC |
| fflate | 0.8.3 | MIT |
| lucide-react | 0.511.0 | ISC |
| @tauri-apps/api | 2.5.0 | Apache-2.0 OR MIT |
| workbox (vite-plugin-pwa ile üretilen service worker) | 7.x | MIT |
| @fontsource-variable/inter (Inter) | 5.2.6 | SIL OFL 1.1 |
| @fontsource/literata (Literata) | 5.2.6 | SIL OFL 1.1 |
| @fontsource/atkinson-hyperlegible (Atkinson Hyperlegible) | 5.2.6 | SIL OFL 1.1 |
| @fontsource/opendyslexic (OpenDyslexic) | 5.2.5 | SIL OFL 1.1 |
| tesseract.js (OCR motoru, Tesseract LSTM WebAssembly) | 7.0.0 | Apache-2.0 |
| @tesseract.js-data/tur, @tesseract.js-data/eng (dil verileri) | — | Apache-2.0 |
| @wllama/wllama (Zihin motoru, llama.cpp WebAssembly) | 3.8.1 | MIT |
| @capacitor/core, @capacitor/android (Android kabuğu) | 8.5.3 | MIT |

## Zihin modelleri (isteğe bağlı, uygulamayla dağıtılmaz)
Model dosyaları yalnızca kullanıcı isterse Zihin paketinden indirilir. Her modelin lisansı manifestte ve Ayarlar → Zihin ekranında gösterilir (önerilen Qwen3 modelleri: Apache-2.0). Ayrıntı: `docs/ZIHIN.md`.

## Masaüstü (Rust, `src-tauri`)
| Crate | Lisans |
|---|---|
| tauri, tauri-build | Apache-2.0 OR MIT |
| reqwest (rustls) | Apache-2.0 OR MIT |
| serde, serde_json | Apache-2.0 OR MIT |
| sha2, hex, futures-util | Apache-2.0 OR MIT |
| tiny_http (NexAktar yerel sunucusu) | Apache-2.0 OR MIT |
| qrcode (NexAktar QR kodu) | Apache-2.0 OR MIT |
| getrandom (tek kullanımlık anahtar) | Apache-2.0 OR MIT |

## Android (`android/`)
| Bileşen | Lisans |
|---|---|
| Capacitor Android çalışma zamanı | MIT |
| AndroidX (appcompat, core, coordinatorlayout, splashscreen, webkit) | Apache-2.0 |

## Geliştirme araçları (dağıtıma girmez)
Vite, TypeScript, Vitest, Playwright, @axe-core/playwright (MPL-2.0), ESLint, fake-indexeddb, pdf-lib (test fikstürleri), vite-plugin-pwa, @capacitor/cli, @tauri-apps/cli.

## İçerik
- Deneme modu örnek metni (`src/sample/sample.ts`): NexLearn için özgün olarak yazılmıştır, CC BY 4.0.
- Logo ve manzara illüstrasyonları: proje için özgün SVG çizimler.
