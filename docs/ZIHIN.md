# Zihin — isteğe bağlı yerel yapay zekâ

Zihin, NexLearn'in **çekirdeğe bağımlı olmayan**, isteğe bağlı yapay zekâ eklentisidir. Ollama gibi ayrı bir program kurmayı gerektirmez; küçük bir dil modeli doğrudan uygulamanın içinde, WebAssembly ile ve tamamen cihazda çalışır. Windows, Android ve web sürümünde aynı şekilde işler.

## Kullanım

Ayarlar → Zihin → **Zihin'i etkinleştir**. Önerilen model bir kez indirilir, SHA-256 ile doğrulanır, başlatılır ve okuma ekranındaki öneriler açılır. Başka hiçbir adım yoktur; sonraki açılışlarda Zihin, okuma ekranında bir Zihin düğmesine basıldığında kendiliğinden başlar. Web sürümünde tarayıcı GitHub'dan doğrudan indiremediği için aynı düğme bir .gguf dosyası seçtirir. Elle dosya seçme yalnızca **Gelişmiş** altındadır (internetsiz kullanım).

## Ne yapar?

Okuma ekranında, “Kendi cümlelerinle anlat” kutusunun altında (Ayarlar → Zihin'den açılınca):

- **Kart öner** — geçerli bölümden en çok 4 soru-cevap kartı önerir. Her öneri tek tek onaylanır ya da düzenlenerek eklenir. Eklenen kartlar “otomatik öneri” kökeniyle işaretlenir.
- **Basitçe açıkla** — bölümü günlük dille 3–5 cümleyle açıklar; istenirse not olarak kaydedilir.
- **Anlatımımı değerlendir** — kendi anlatımını kaynakla karşılaştırır: eksik noktalar, düzeltilmesi gerekenler ve tek cümlelik öneri.

Model çıktısı asla doğrudan kaydedilmez. Kart önerilerinde, cevabı kaynak metinde hiç geçmeyen öneriler otomatik elenir (uydurmaya karşı basit güvence).

## Mimari

| Parça | Ayrıntı |
|---|---|
| Motor | [wllama](https://github.com/ngxson/wllama) 3.8 (llama.cpp'nin WebAssembly derlemesi, MIT). JS kodu tembel yüklenir; Zihin başlatılmadıkça hiç indirilmez. |
| Çalışma zamanı | `wllama.wasm` (~8,4 MB, sıkıştırılınca ~3 MB). Tüm derlemelerde uygulamayla gelir; yalnızca Zihin başlatılınca yüklenir ve ön önbelleğe alınmaz. Kullanıcı bu dosyayla hiç uğraşmaz. |
| Model | GGUF biçiminde küçük bir dil modeli (önerilen: ~0,5–1 GB). |
| Sağlayıcı arayüzü | `ModelProvider` (`src/zihin/engine.ts`). Başka bir motor eklemek için yalnızca bu arayüz uygulanır. |
| Hızlandırma | Cihazda WebGPU varsa (Windows'ta WebView2 destekler) hesaplama ekran kartına verilir; yoksa ya da başarısız olursa işlemciyle çalışır. |
| Güvenlik | Model çalıştırılabilir dosya değildir; WebView'in kum havuzundaki WebAssembly içinde çalışır. İndirilen her dosya manifestteki SHA-256 ve boyutla doğrulanır; uyuşmayan dosya silinir. Uyumluluk modu (CDN'den dosya çeken) kapatılmıştır; Zihin hiçbir ağ isteği yapmaz. |

### Dosyaların saklandığı yer

- **Windows:** `%LOCALAPPDATA%\com.eirahoutmoss.nexlearn\zihin\` (yalnızca bu klasör, asset protokolüyle ön yüze açılır)
- **Android:** uygulamanın özel dosya alanı (`files/zihin`)
- **Web:** tarayıcının özel dosya sistemi (OPFS)

## Paketi yayımlama (geliştirici)

1. Bir GGUF model indir (bilgisayarında). Lisansı yeniden dağıtıma izin veren bir model seç. Öneri:
   - **Qwen3 0.6B Instruct, Q4_K_M** (Apache-2.0, Türkçe dahil çok dilli, ~400 MB) — varsayılan
   - Daha güçlü cihazlar için: **Qwen3 1.7B Instruct, Q4_K_M** (Apache-2.0, ~1,1 GB)
2. Dosya adını sadeleştir (yalnızca harf, rakam, `.`, `_`, `-`), ör. `qwen3-0.6b-instruct-q4_k_m.gguf`.
3. Manifesti üret:
   ```sh
   npm ci
   node scripts/make-zihin-manifest.mjs ~/İndirilenler/qwen3-0.6b-instruct-q4_k_m.gguf \
     --id qwen3-0-6b --label "Qwen3 0.6B (önerilen)" --license Apache-2.0 --langs tr,en --ctx 4096
   ```
   `dist-zihin/` klasörüne `zihin-manifest.json` (ve kayıt için `wllama.wasm`) yazılır.
4. GitHub'da **`zihin-v1`** etiketiyle yeni bir sürüm oluştur ve **“Set as a pre-release”** işaretle (uygulama güncellemeleri bu sürümü zaten yok sayar; işaret ek güvencedir). Şu dosyaları yükle:
   - `dist-zihin/wllama.wasm`
   - `dist-zihin/zihin-manifest.json`
   - model `.gguf` dosyası (GitHub tek dosya için 2 GB'a kadar izin verir)
5. Uygulamada Ayarlar → Zihin → **Zihin paketlerini listele** → **İndir** → **Başlat**.

Yeni model eklemek ya da modeli değiştirmek için 3–4. adımları tekrarla ve manifesti güncelle (aynı `zihin-v1` sürümüne yeniden yükle). Uygulama, manifestte olmayan dosyaları indirmez.

## Manifest biçimi (`zihin-manifest.json`)

```json
{
  "format": "nexlearn-zihin",
  "formatVersion": 1,
  "runtime": { "engine": "wllama", "version": "3.8.1", "name": "wllama.wasm", "url": "https://github.com/Eirahoutmoss/NexLearn/releases/download/zihin-v1/wllama.wasm", "size": 8763949, "sha256": "…" },
  "models": [
    { "id": "qwen3-0-6b", "label": "Qwen3 0.6B (önerilen)", "license": "Apache-2.0", "languages": ["tr", "en"], "contextLength": 4096,
      "name": "qwen3-0.6b-instruct-q4_k_m.gguf", "url": "https://github.com/Eirahoutmoss/NexLearn/releases/download/zihin-v1/qwen3-0.6b-instruct-q4_k_m.gguf", "size": 0, "sha256": "…" }
  ]
}
```

Uygulama yalnızca `https://github.com/Eirahoutmoss/NexLearn/releases/download/` ile başlayan adresleri kabul eder.

## Sınırlar

- Küçük modeller yanılabilir; arayüz bunu açıkça söyler ve her öneriyi onaya bırakır.
- Model belleğe tümüyle yüklenir: 0,6B model için ~1 GB, 1,7B için ~2 GB boş bellek gerekir.
- Web sürümünde iPhone/Safari, motorun gerektirdiği WebAssembly özelliklerini (memory64) henüz desteklemeyebilir; bu durumda Zihin başlatılamaz, uygulamanın geri kalanı etkilenmez.
- Hız cihaza bağlıdır; tek iş parçacığıyla çalışır (çapraz köken yalıtımı gerektirmemek için).
