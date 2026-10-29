# Veri Modeli

Depolama: IndexedDB veritabanı `nexlearn`, şema sürümü **1** (`DB_VERSION`). Dışa aktarma/yedek şema sürümü **1.2.0** (`DATA_SCHEMA_VERSION`, SemVer).

| Şema | Değişiklik (hepsi geriye uyumlu, isteğe bağlı alanlar) |
|---|---|
| 1.0.0 | İlk sürüm |
| 1.1.0 | `ReviewEvent.confidence` (1–3), ayarlarda `askConfidence`, `interleave`; kaynak türü `epub`; oturum türü `practice`; segmentte `confidence` (OCR) |
| 1.2.0 | Varlıklarda ve segmentlerde `pack: { id, itemId, version }` (paylaşım paketi kökeni); ayarlarda `zihinEnabled` |

## İlkeler
- Zamanlar UTC ISO 8601 metin; yerel gösterim arayüzde.
- Varlıklar `id`, `createdAt`, `updatedAt`, `revision` (monoton) ve yumuşak silme için `deletedAt` taşır. Kalıcı silme ayrı ve onaylıdır.
- `updateEntity(…, expectedRevision)` farklı sürümde `DB-003` (çakışma) fırlatır.
- Otomatik içerik ile kullanıcı içeriği `provenance` (`user` | `automatic` | `imported`) ve `userConfirmed` ile ayrılır.
- Deneme modu kayıtları `isSample: true` taşır ve topluca kaldırılabilir.
- Paylaşım paketinden gelen kayıtlar `pack` kökeni taşır (bkz. `docs/NEXPACK.md`).

## Depolar
| Depo | Anahtar | Dizin | İçerik |
|---|---|---|---|
| `sources` | `id` | — | Kaynak: başlık, tür, `contentHash` (sha256), `processingStatus`, `errorCode`, sayfa/kelime/segment sayısı, etiketler, `storageRef` |
| `segments` | `id` | `sourceId` | Konumlanabilir parça: tür, metin, `pageNumber`, `startOffset`/`endOffset`, `headingPath`, `extractionMethod`, `locator {type, value}` |
| `files` | `id` | `sourceId` | Orijinal dosya (Blob) |
| `annotations` | `id` | `sourceId` | Vurgu/not/yer imi/alıntı/açıklama; segment içi aralık, renk, `groupId` (çok segmentli seçim), etiketler |
| `concepts` | `id` | — | Kavram, açıklama, kendi cümlelerin, örnekler, kaynak referansları, harita konumu |
| `relations` | `id` | — | `fromConceptId`, `toConceptId`, `relationType`, provenance, kaynaklar, onay |
| `items` | `id` | — | Öğrenme öğesi (`qa` / `question`): soru, cevap, açıklama, kaynak ve kavram bağları, askı |
| `reviewStates` | `learningItemId` | — | SM-2 durumu: tekrar sayısı, aralık, kolaylık, unutma, vade, `algorithmVersion` |
| `reviewEvents` | `id` | `learningItemId`, `reviewedAt` | Tek tekrar: puan, düğme, süre, (izinle) yazılan cevap, önce/sonra planı |
| `tasks` | `id` | — | Uygulama görevi ve denemeleri (öz değerlendirme) |
| `sessions` | `id` | `startedAt` | Öğrenme oturumu (okuma/tekrar), etkin süre |
| `readingStates` | `sourceId` | — | Okuma konumu ve en ileri konum |
| `settings` | `id` (`app`) | — | Ayarlar |
| `meta` | `key` | — | Uygulama meta verileri: `publishedPacks` (yayımlanan paketler), `duels` (meydan okumalar) |
| `snapshots` | `id` | — | Geri yükleme öncesi anlık görüntü (yalnızca en sonuncusu) |

## Göç stratejisi
- IndexedDB: `upgrade(db, oldVersion)` içinde `if (oldVersion < N)` adımları; yeni sürüm eklenince adım eklenir, eski adımlar korunur.
- Yedek: `checkCompatibility(backup, current)` — aynı major okunur (yeni minor’daki bilinmeyen alanlar yok sayılır), daha yeni major `RST-001` ile reddedilir, bir önceki major “migrate” yoluyla okunur (göç fonksiyonu ilk major değişikliğinde eklenecek).

## Yedek paketi (`nexlearn-backup-YYYYMMDD-HHMMSS.zip`)
```
manifest.json          format, schemaVersion, appVersion, createdAt, checksumAlgo, originals[]
data/sources.json  data/segments.json  data/annotations.json  data/concepts.json
data/relations.json  data/learning-items.json  data/review-states.json  data/review-events.json
data/tasks.json  data/sessions.json  data/reading-states.json  data/settings.json
originals/<sourceId>.<ext>   (isteğe bağlı)
checksums.sha256       "<sha256>  <yol>" satırları
```
Geri yükleme sırası: (şifre çözme) → güvenli yol denetimi ve boyut sınırı → manifest → sağlama toplamı (listelenmeyen dosya reddedilir) → yapısal doğrulama → sürüm uyumu → **anlık görüntü** → tek işlemde yazma.

**Şifreli yedek** (`.nexlearn-enc`): `NXLENC01` | yineleme (u32 BE) | tuz (16) | IV (12) | AES-256-GCM şifreli ZIP. Anahtar PBKDF2-SHA256, 600.000 yineleme. Parola unutulursa kurtarma yoktur.

## Tek dosyalık JSON dışa aktarma
`schemaVersion, exportedAt, appVersion, sources[] (segments iç içe), annotations, concepts, relations, learningItems, reviewStates, reviewEvents, applicationTasks, sessions, readingStates, settings` — şartnamedeki örnekle uyumlu; geri yükleme de bu biçimi kabul eder.

## CSV
- Kartlar: `id,type,prompt,answer,explanation,tags,suspended,repetitions,intervalDays,easeFactor,lapses,dueAt,lastReviewedAt,source,page,createdAt`
- Tekrar geçmişi: `id,cardId,prompt,reviewedAt,rating,button,intervalBefore,intervalAfter,easeAfter,responseMs`
UTF-8 BOM’lu; `= + - @` ile başlayan hücreler formül enjeksiyonuna karşı `'` ile korunur.

## Tekrar algoritması (`sm2-v1`)
Ürün şartnamesindeki algoritmanın birebir uygulaması (`src/domain/scheduler.ts`). Düğme → puan: Tekrar=1, Zor=3, Normal=4, Kolay=5. Kolaylık 4 ondalığa yuvarlanır (kayan nokta gürültüsünü önlemek için), aralık en az 1 gün. Kuyruk: askıda olmayan, silinmemiş ve vadesi **yerel gün sonuna** kadar gelen kartlar.

## Metrik tanımları
- Anlık doğruluk: önceki görüşmeden (ilk tekrarda kart oluşturulmasından) < 1 gün sonra yapılan tekrarlarda puan ≥ 3 oranı.
- 1+ gün sonra hatırlama: aralık 1–7 gün. 1+ hafta sonra hatırlama: aralık ≥ 7 gün.
- Zor kart: en az bir kez tekrar edilmiş ve (unutma ≥ 2 veya kolaylık ≤ 1.7).
- Okuma süresi: sekme görünür ve son 90 sn içinde etkileşim varken sayılan etkin süre (5 sn altı oturum kaydedilmez).
