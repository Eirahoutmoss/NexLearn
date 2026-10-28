# Mimari

**Modüler monolit, yerel öncelikli.** Tek bir React + TypeScript uygulaması hem web/PWA olarak hem de Tauri 2 ile Windows masaüstü uygulaması olarak paketlenir. Sunucu yoktur.

## Katmanlar
```
UI (src/modules/*, src/components, src/app)
  └─ Uygulama servisleri (src/services/*)      ← UI yalnızca bunları çağırır
       └─ Domain çekirdeği (src/domain/*)       ← saf fonksiyonlar, React/IndexedDB bilmez
       └─ Depolama adaptörü (src/adapters/storage) ← IndexedDB (idb), şema göçleri, değişiklik yayını
       └─ İşleme adaptörleri (src/adapters/pdf, src/services/import) ← pdf.js, metin/Markdown bölütleme
       └─ Platform adaptörleri (src/services/update.ts, src-tauri) ← güncelleme, masaüstü komutları
```

## Dizinler
| Yol | Sorumluluk |
|---|---|
| `src/domain` | Türler, SM-2 zamanlayıcı (`scheduler.ts`), ilişki kuralları, konum çözümleme, Türkçe metin normalleştirme, hata taksonomisi |
| `src/services` | `sources` (içe aktarma), `annotations`, `reading` (konum/oturum), `memory` (kart/tekrar), `learn` (kavram/ilişki/görev), `progress` (metrikler), `search`, `settings`, `backup/*`, `export/*`, `update` |
| `src/adapters/storage` | `db.ts` (şema, göç, BroadcastChannel ile sekmeler arası değişiklik bildirimi), `repo.ts` (genel CRUD, yumuşak silme, revizyon/çakışma) |
| `src/adapters/pdf` | pdf.js yükleme (tembel), metin çıkarımı (sayfa/ofset korunur), sayfa çizimi |
| `src/modules/*` | Ekranlar: home, library, read, memory, learn, notes, tasks, progress, settings, help |
| `src/app` | Kabuk, yönlendirici (hash), kısayollar, diyaloglar (içe aktarma, kart, kavram), ilk kullanım |
| `src/styles` | Tasarım token’ları (`themes.ts`, kontrast testli), temel/bileşen/sayfa stilleri |
| `src/i18n` | Türkçe (kaynak) ve İngilizce sözlükler; eksik çeviri EN → TR düşer |
| `src-tauri` | Tauri kabuğu; yalnızca `download_update` ve `install_update` komutları |

## Sözleşmeler
- UI veritabanına doğrudan erişmez; servis fonksiyonlarını çağırır. Veri okuma `useQuery(fn, deps, stores)` ile yapılır; ilgili depo değişince (aynı/başka sekme) otomatik yenilenir.
- Zamanlayıcı saf fonksiyondur: `schedule(state, rating, now, config) → state`. Yan etkisi yoktur.
- İçe aktarma: `detectKind` (sihirli bayt + uzantı) → `checkSize` → hash → yineleme sorusu → kaynak + orijinal dosya kaydı → çıkarım → segmentlerin tek işlemde yazılması.
- Tüm çok depolu yazmalar tek IndexedDB işleminde yapılır (kart + tekrar durumu, tekrar olayı + durum, geri yükleme, kavram silme + ilişkiler).
- `any` kullanılmaz (ESLint hatası).

## Hata yönetimi
`AppError(code, details)` (bkz. `domain/errors.ts`). Kullanıcıya `errors.<KOD>.title + action` gösterilir; teknik ayrıntı yalnızca “Ayrıntılar” altında ve kişisel veri içermez. Günlük bellek içi halka tampondur; dosya adı/metin yazılmaz.

## Performans
- pdf.js ayrıştırması kendi Web Worker’ında; sayfa sayfa ilerleme ve iptal.
- Okuma alanında `content-visibility: auto`; sayfa görünümü tembel çizim (IntersectionObserver).
- Arama: bellek içi normalleştirilmiş dizin, 10k segmentte < 100 ms (test).
- Rotalar tembel yüklenir; pdf.js yalnızca gerektiğinde indirilir.
