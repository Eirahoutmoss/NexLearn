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
5. `release.yml` Windows’ta derler, `*-setup.exe` ve `*.msi` dosyalarını ve `SHA256SUMS.txt`’yi GitHub sürümüne ekler. Uygulamadaki **Güncellemeleri denetle** düğmesi bu sürümü bulur.
6. Web/PWA sürümü `dist/` olarak herhangi bir statik barındırmaya konabilir; kullanıcı yeni sürüm bildirimini görür.

**Geri alma:** Kritik hatada önceki etiketin kurulum dosyası sürüm sayfasından kurulabilir; veriler WebView deposunda korunur. Şema değişikliği içeren bir sürümden geri dönmeden önce yedek alınmalıdır.
