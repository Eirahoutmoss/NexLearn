import { expect, test } from '@playwright/test';
import { openApp, SAMPLE_MD } from './helpers';

test('çevrimdışı: uygulama ağ olmadan açılır ve temel akış çalışır', async ({ page, context }) => {
  await openApp(page);
  // Service worker'ın kurulup sayfayı denetlemesini bekle.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15000 }).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Kaynaklar|Öğrenme alanın hazır/ }).first()).toBeVisible();

  // Ağ yokken metin kaynağı oluştur, oku, kart ekle ve tekrar et.
  await page.getByRole('button', { name: 'Kaynak ekle' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Kaynak ekle' });
  await dialog.getByRole('tab', { name: 'Metin yapıştır' }).click();
  await dialog.getByLabel('Metin', { exact: true }).fill(SAMPLE_MD);
  await dialog.getByRole('button', { name: 'Kaynak olarak ekle' }).click();
  await expect(page.locator('.reading')).toContainText('UDP bağlantısızdır');
  await page.locator('.seg').nth(1).focus();
  await page.keyboard.press('c');
  const card = page.getByRole('dialog', { name: 'Yeni kart' });
  await card.getByLabel('Soru').fill('Çevrimdışı soru?');
  await card.getByRole('button', { name: 'Kaydet' }).click();
  await page.goto('/#/review');
  await page.getByRole('button', { name: 'Cevabı Göster' }).click();
  await page.getByRole('button', { name: /Kolay/ }).click();
  await expect(page.getByRole('heading', { name: 'Bugünlük bu kadar' })).toBeVisible();
  await context.setOffline(false);
});
