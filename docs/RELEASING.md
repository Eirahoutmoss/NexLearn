# Sürüm Süreci

SemVer: `major.minor.patch`. MVP 0.x ile başlar; ilk kararlı sürüm 1.0.0.

1. `package.json` sürümünü güncelle (Tauri sürümü buradan okunur).
2. `docs/CHANGELOG.md`’ye Keep a Changelog biçiminde girdi ekle.
3. Yayın öncesi kontrol listesi:
   - `npm run typecheck && npm run lint && npm test` yeşil
   - `npm run build && npx playwright test` yeşil (axe erişilebilirlik, çevrimdışı, performans dahil)
   - `cargo test --manifest-path src-tauri/Cargo.toml` yeşil
   - Eski yedek → yeni sürüm göç testi (şema değiştiyse)
   - `docs/THIRD_PARTY.md` güncel
4. Etiketle ve gönder: `git tag v0.2.0 && git push origin v0.2.0`
5. `release.yml` Windows kurulum dosyalarını (`*-setup.exe`, `*.msi`) ve — imza anahtarı tanımlıysa — Android APK'yı üretir, hepsi için tek bir `SHA256SUMS.txt` hesaplar ve GitHub sürümüne ekler. Uygulamadaki **Güncellemeleri denetle** düğmesi bu sürümü bulur. Uygulama yalnızca `vX.Y.Z` biçimli, taslak ya da ön sürüm olmayan etiketleri dikkate alır (ör. `zihin-v1` yok sayılır).

### Android imza anahtarı (bir kez)
```sh
keytool -genkeypair -v -keystore nexlearn.jks -alias nexlearn -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 nexlearn.jks > nexlearn.jks.b64   # Windows: certutil -encode nexlearn.jks nexlearn.jks.b64
```
GitHub → Settings → Secrets and variables → Actions altında: `NEXLEARN_KEYSTORE_BASE64` (b64 dosyasının içeriği), `NEXLEARN_KEYSTORE_PASSWORD`, `NEXLEARN_KEY_ALIAS` (`nexlearn`), `NEXLEARN_KEY_PASSWORD`. **Anahtar dosyasını ve parolaları güvenli bir yerde yedekle:** anahtar kaybolursa mevcut kurulumlar yeni APK'larla güncellenemez.

### Zihin paketi
Uygulama sürümünden bağımsızdır; `docs/ZIHIN.md`'deki adımlarla `zihin-v1` etiketli ön sürüm olarak yayımlanır.
6. Web/PWA sürümü `dist/` olarak herhangi bir statik barındırmaya konabilir; kullanıcı yeni sürüm bildirimini görür.

**Geri alma:** Kritik hatada önceki etiketin kurulum dosyası sürüm sayfasından kurulabilir; veriler WebView deposunda korunur. Şema değişikliği içeren bir sürümden geri dönmeden önce yedek alınmalıdır.
