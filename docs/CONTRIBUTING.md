# Katkı Rehberi

Teşekkürler! NexLearn ücretsiz ve açık kaynaklıdır (MPL-2.0).

## Geliştirme ortamı
```bash
npm ci
npm run dev
```
Masaüstü için Rust stable ve (Linux’ta) `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev` gerekir.

## Kurallar
- TypeScript strict; `any` yasak. Domain kuralları `src/domain` içinde saf fonksiyonlar olarak kalır; UI veritabanına doğrudan erişmez.
- Kullanıcıya görünen her metin `src/i18n/tr.ts` ve `en.ts` içinde olmalı (test bunu denetler).
- Renk eklerken `src/styles/themes.ts` içine token olarak ekle; kontrast testi geçmeli.
- Çalışmayan düğme, sahte veri veya sabit istatistik eklenmez.
- Her hata düzeltmesi bir regresyon testiyle gelir. Testler zayıflatılmaz.

## Commit ve PR
- Conventional Commits (`feat:`, `fix:`, `docs:`…).
- DCO: her commit `Signed-off-by: Ad Soyad <e-posta>` içermeli (`git commit -s`).
- PR’lar `typecheck`, `lint`, `test`, `build`, `e2e` (erişilebilirlik dahil) adımlarını geçmelidir.
- Yeni başlayanlar için `good first issue` etiketine bak. Çeviri katkıları özellikle açığız.
