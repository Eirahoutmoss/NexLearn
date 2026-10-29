# Geliştirme Notları

NexLearn, Hasan Güler tarafından geliştirilir ve dış katkı (pull request) kabul etmez. Hata ve öneri bildirimleri GitHub “Issues” üzerinden yapılabilir.

## Ortam
```bash
npm ci
npm run dev
```
Masaüstü için Rust stable ve (Linux’ta) `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev` gerekir.

## Kurallar
- TypeScript strict; `any` yasak. Domain kuralları `src/domain` içinde saf fonksiyonlar olarak kalır; arayüz veritabanına doğrudan erişmez.
- Kullanıcıya görünen her metin `src/i18n/tr.ts` ve `en.ts` içinde olmalı (test bunu denetler).
- Renkler `src/styles/themes.ts` içinde token olarak tanımlanır; kontrast testi geçmelidir.
- Çalışmayan düğme, sahte veri veya sabit istatistik eklenmez. Her hata düzeltmesi bir regresyon testiyle gelir.
- Commit mesajları Conventional Commits biçimindedir (`feat:`, `fix:`, `docs:`…).
- Antivirüs dostu kurallar: paketleme/sıkıştırma (UPX vb.) ve kod karartma kullanılmaz; arka planda sürekli dinleyen port, global klavye kancası ve otomatik başlangıç kaydı eklenmez.
