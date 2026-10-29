import { expect, test } from '@playwright/test';
import { encryptPdf, hasQpdf, importFiles, makeScannedPdf, makeTextPdf, openApp } from './helpers';

const PAGES = [
  ['Network Basics', '', 'The Internet Protocol moves packets between networks.', 'Routers forward each packet to the next hop.'],
  ['Transport Layer', '', 'TCP adds reliable, ordered delivery on top of IP.', 'A connection starts with a three-way handshake.'],
  ['Datagrams', '', 'UDP is connectionless and has low overhead.'],
];

test('metin katmanlı PDF: sayfa konumları korunur, sayfa görünümü çizilir', async ({ page }) => {
  await openApp(page);
  const dialog = await importFiles(page, [{ name: 'network-notes.pdf', mimeType: 'application/pdf', buffer: await makeTextPdf(PAGES) }]);
  await expect(dialog.getByText('Hazır')).toBeVisible({ timeout: 20000 });
  await dialog.getByRole('button', { name: 'Okumaya başla' }).click();
  await expect(page.locator('.reading')).toContainText('three-way handshake');
  await expect(page.locator('.page-marker')).toHaveCount(3);
  await expect(page.getByText('Sayfa 1 / 3')).toBeVisible();
  // Kaynaklı kart: sayfa numarası kart kaynağında görünür
  await page.locator('.seg', { hasText: 'three-way handshake' }).focus();
  await page.keyboard.press('c');
  const card = page.getByRole('dialog', { name: 'Yeni kart' });
  await expect(card).toContainText('Sayfa 2');
  await card.getByRole('button', { name: 'Vazgeç' }).click();
  // Sayfa görünümü
  await page.getByRole('button', { name: 'Sayfa', exact: true }).click();
  const canvas = page.locator('canvas.pdf-canvas').first();
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.evaluate((c: HTMLCanvasElement) => c.width), { timeout: 15000 }).toBeGreaterThan(100);
});

test('taranmış PDF: metin yok uyarısı ve OCR seçeneği', async ({ page }) => {
  await openApp(page);
  const dialog = await importFiles(page, [{ name: 'scan.pdf', mimeType: 'application/pdf', buffer: await makeScannedPdf() }]);
  await expect(dialog.getByText('Metin bulunamadı')).toBeVisible({ timeout: 20000 });
  await expect(dialog.getByText('Taranmış PDF', { exact: false })).toBeVisible();
});

test('şifreli PDF: parola sorulur, yanlış parola reddedilir, doğru parola açar', async ({ page }) => {
  test.skip(!hasQpdf(), 'qpdf yok');
  await openApp(page);
  const enc = encryptPdf(await makeTextPdf(PAGES), 'gizli123');
  const dialog = await importFiles(page, [{ name: 'locked.pdf', mimeType: 'application/pdf', buffer: enc }]);
  const pw = page.getByRole('dialog', { name: 'Parola gerekli' });
  await expect(pw).toBeVisible();
  await pw.getByLabel('PDF parolası').fill('yanlis');
  await pw.getByRole('button', { name: 'Aç' }).click();
  await expect(page.getByRole('dialog', { name: 'Parola gerekli' })).toContainText('Parola yanlış');
  await page.getByLabel('PDF parolası').fill('gizli123');
  await page.getByRole('dialog', { name: 'Parola gerekli' }).getByRole('button', { name: 'Aç' }).click();
  await expect(dialog.getByText('Hazır')).toBeVisible({ timeout: 20000 });
});

test('aynı dosya yeniden eklenirse sorulur ve otomatik silinmez', async ({ page }) => {
  await openApp(page);
  const buf = Buffer.from('Aynı içerik.\n\nİkinci paragraf.', 'utf8');
  let dialog = await importFiles(page, [{ name: 'a.txt', mimeType: 'text/plain', buffer: buf }]);
  await expect(dialog.getByText('Hazır')).toBeVisible();
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  dialog = await importFiles(page, [{ name: 'b.txt', mimeType: 'text/plain', buffer: buf }]);
  const confirm = page.getByRole('dialog', { name: 'Bu dosya zaten kütüphanende' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(dialog.getByText('Zaten var')).toBeVisible();
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await page.goto('/#/library');
  await expect(page.locator('.source-card')).toHaveCount(1);
});
