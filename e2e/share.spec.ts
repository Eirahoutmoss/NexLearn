import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importFiles, importMarkdown, openApp } from './helpers';

test('paylaşım paketi: dışa aktar → içe aktar → güncelleme olarak tanınır', async ({ page }) => {
  await openApp(page);
  await importMarkdown(page);
  await page.goto('/#/library');
  await page.getByRole('button', { name: 'Paket olarak paylaş' }).click();
  const dlg = page.getByRole('dialog', { name: 'Paylaşım paketi oluştur' });
  await dlg.getByLabel('Paket adı').fill('Ağ Dersi');
  await dlg.getByRole('checkbox', { name: /protokoller/ }).check();
  await dlg.getByText('Kurumsal bilgi tabanı', { exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Paketi oluştur' }).click()]);
  expect(download.suggestedFilename()).toBe('ag-dersi-v1.nexpack');
  const bytes = readFileSync((await download.path())!);

  const imp = await importFiles(page, [{ name: 'ağ-dersi-v1.nexpack', mimeType: 'application/octet-stream', buffer: bytes }]);
  const packDlg = page.getByRole('dialog', { name: 'Paketi içe aktar' });
  await expect(packDlg).toContainText('Ağ Dersi');
  await expect(packDlg).toContainText('Kurumsal bilgi tabanı');
  await packDlg.getByRole('button', { name: 'İçe aktar', exact: true }).click();
  await expect(page.getByText(/kayıt eklendi/)).toBeVisible();
  await imp.getByRole('button', { name: 'Kapat' }).first().click();
  await expect(page.locator('.source-card-pack')).toContainText('Ağ Dersi · sürüm 1');

  // Aynı dosya yeniden: "zaten kitaplığında"
  await importFiles(page, [{ name: 'ağ-dersi-v1.nexpack', mimeType: 'application/octet-stream', buffer: bytes }]);
  await expect(page.getByRole('dialog', { name: 'Paketi içe aktar' })).toContainText('Bu sürüm zaten kitaplığında.');
});

test('NexAktar telefon sayfası: dosya ve metin gönderir, bilgisayardan dosya listeler', async ({ page }) => {
  const html = readFileSync(join(process.cwd(), 'src-tauri', 'src', 'aktar_page.html'), 'utf8');
  const uploads: { path: string; name: string; size: number }[] = [];
  await page.route('http://aktar.test/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.searchParams.get('t') !== 'tok') return route.fulfill({ status: 403, body: 'x' });
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    if (url.pathname === '/ping') return route.fulfill({ json: { ok: true, remaining: 540 } });
    if (url.pathname === '/o') return route.fulfill({ json: [{ id: 'abc', name: 'yedek.zip', size: 10 }] });
    if (url.pathname === '/u' || url.pathname === '/text') {
      uploads.push({ path: url.pathname, name: decodeURIComponent(req.headers()['x-name'] ?? ''), size: req.postDataBuffer()?.length ?? 0 });
      return route.fulfill({ json: { ok: true, id: String(uploads.length) } });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://aktar.test/?t=tok');
  await expect(page.getByRole('heading', { name: 'Bilgisayara gönder' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('9 dk kaldı');
  await expect(page.getByRole('link', { name: 'İndir' })).toHaveAttribute('href', '/o/abc?t=tok');

  await page.locator('#files').setInputFiles([{ name: 'ödev notları.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') }]);
  await expect(page.getByText('Gönderildi — bilgisayarda onayla')).toBeVisible();
  await page.getByLabel('Not ya da kopyaladığın bir metin').fill('Sınavda TCP sorulacak');
  await page.getByRole('button', { name: 'Metni gönder' }).click();
  await expect(page.getByText('Gönderildi — bilgisayarda onayla')).toHaveCount(2);
  expect(uploads).toEqual([
    { path: '/u', name: 'ödev notları.pdf', size: 13 },
    { path: '/text', name: 'Sınavda TCP sorulacak.txt', size: Buffer.byteLength('Sınavda TCP sorulacak') },
  ]);
});
