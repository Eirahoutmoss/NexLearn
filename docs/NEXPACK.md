# .nexpack paylaşım paketi (biçim sürümü 1)

`.nexpack`, NexLearn içeriğini başkalarıyla paylaşmak için kullanılan açık bir ZIP biçimidir. İki kullanım vardır:

- **Çalışma grubu (`study`)** — Bir kez paylaşılır. Alan kişi kendi kopyasını özgürce değiştirir.
- **Kurumsal bilgi tabanı (`knowledge`)** — Yayıncı aynı paketi (`packId`) yeni sürümle yeniden yayımlar. Alıcı yeni sürümü içe aktardığında yerel kopya **güncellenir**: içerik yenilenir, kişisel tekrar planı, kendi notları ve vurguları korunur; yeni sürümde çıkarılan kayıtlar çöp kutusuna taşınır.

Kişisel veriler (tekrar durumu ve geçmişi, okuma konumu, oturumlar, ayarlar) **hiçbir pakete girmez**. Notlar ve vurgular yalnızca yayıncı açıkça seçerse eklenir.

## Yapı

```
manifest.json      paket kimliği, sürüm, başlık, sayımlar, sağlama toplamları
content.json       { sources, segments, annotations, concepts, relations, items }
files/<id>.<ext>   isteğe bağlı orijinal dosyalar (PDF, EPUB, görsel, metin)
```

### manifest.json

| Alan | Tür | Açıklama |
|---|---|---|
| `format` | `"nexpack"` | Sabit. |
| `formatVersion` | sayı | Şu an `1`. Daha yeni biçimler `PCK-002` ile reddedilir. |
| `packId` | metin | Paketin kalıcı kimliği (`[A-Za-z0-9_-]`, ≤ 64). |
| `version` | tam sayı ≥ 1 | Her yeniden yayında bir artar. |
| `kind` | `"study"` \| `"knowledge"` | |
| `title`, `description`, `author` | metin | Sırasıyla ≤ 200, 2000, 120 karakter. |
| `createdAt`, `appVersion` | metin | |
| `counts` | nesne | Tür başına kayıt sayısı (bilgi amaçlı). |
| `contentSha256` | metin | `content.json` dosyasının SHA-256 özeti. |
| `files` | dizi | `{ itemId, path, mimeType, sha256 }` — her orijinal dosya için. |

### content.json

Kayıtlar NexLearn veri modelindeki biçimdedir (bkz. `docs/DATA_MODEL.md`). Kayıt kimlikleri paketin içinde **kalıcı öğe kimliği** (`itemId`) olarak kullanılır; içe aktarırken her kayda yeni bir yerel kimlik verilir ve tüm başvurular (kaynak → segment, kart → kavram, ilişki uçları, kaynak başvuruları) yeniden eşlenir.

## İçe aktarma kuralları

1. ZIP içinde yalnızca `manifest.json`, `content.json` ve `files/<güvenli-ad>.<uzantı>` okunur; diğer yollar (ör. `../`) yok sayılır.
2. `contentSha256` ve her dosyanın özeti doğrulanır; uyuşmazlık `PCK-001` verir. Paket en çok 400 MB ve 200 000 kayıt olabilir.
3. Her kayıt yapısal olarak doğrulanır (yedek doğrulamasıyla aynı kurallar).
4. İçe aktarılan her kayıt `pack: { id, itemId, version }` kökenini taşır. Kavram, ilişki ve kartların kökeni `imported` olarak işaretlenir.
5. Aynı `packId` daha önce içe aktarıldıysa:
   - daha yeni sürüm → **güncelleme** (eşleştirme `itemId` ile; segment kimlikleri korunur, böylece kullanıcının vurguları kopmaz),
   - aynı ya da daha eski sürüm → kullanıcıya bildirilir; istenirse **ayrı kopya** olarak eklenebilir.
6. Yeni kartlara bugünden başlayan bir tekrar planı açılır; güncellenen kartların kişisel planına dokunulmaz.

## Yayıncı tarafı

Yayımlanan paketler (kimlik, son sürüm, seçili kaynaklar) yerel olarak hatırlanır. **Kitaplık → Paket olarak paylaş** penceresinde bir yayın seçilip “Güncellemeyi yayımla” denildiğinde aynı `packId` ile sürüm bir artırılarak yeni dosya üretilir. Dağıtım yöntemi serbesttir: e-posta, paylaşılan klasör, USB, NexAktar.
