import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { importMarkdown, openApp } from './helpers';

test('yedek oluştur → tüm verileri sil → geri yükle → geri al', async ({ page }) => {
  await openApp(page);
  await importMarkdown(page);
  await page.locator('.seg').nth(1).focus();
  await page.keyboard.press('n');
  const noteDialog = page.getByRole('dialog', { name: 'Not ekle' });
  await noteDialog.getByLabel('Notun').fill('Yedek testi notu');
  await noteDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.locator('.reader-panel')).toContainText('Yedek testi notu');

  await page.goto('/#/settings?section=data');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Yedeği oluştur ve indir' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^nexlearn-backup-\d{8}-\d{6}\.zip$/);
  const backupPath = await download.path();

  // JSON dışa aktarma da indirilebilir ve geçerli JSON'dur
  const jsonPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const json = JSON.parse(readFileSync(await (await jsonPromise).path(), 'utf8'));
  expect(json.schemaVersion).toBe('1.1.0');
  expect(json.annotations.some((a: { noteText?: string }) => a.noteText === 'Yedek testi notu')).toBe(true);

  // Tüm verileri sil (yazarak onay)
  await page.getByRole('button', { name: 'Tüm verileri sil' }).click();
  const confirm = page.getByRole('dialog', { name: 'Tüm veriler silinsin mi?' });
  await confirm.getByLabel('Onaylamak için “SİL” yaz').fill('SİL');
  await confirm.getByRole('button', { name: 'Tüm verileri sil' }).click();
  await expect(page.getByText('Tüm veriler silindi.')).toBeVisible();
  await page.goto('/#/library');
  await expect(page.getByText('Kütüphanen boş')).toBeVisible();

  // Geri yükle
  await page.goto('/#/settings?section=data');
  await page.getByTestId('restore-input').setInputFiles(backupPath);
  const preview = page.getByRole('dialog', { name: 'Geri yükleme önizlemesi' });
  await expect(preview).toContainText('Doğrulandı');
  await preview.getByRole('button', { name: 'Geri yükle' }).click();
  await page.getByRole('dialog', { name: 'Geri yükleme yapılsın mı?' }).getByRole('button', { name: 'Geri yükle' }).click();
  await expect(page.getByText('Yedek geri yüklendi.')).toBeVisible();
  await page.goto('/#/notes');
  await expect(page.getByText('Yedek testi notu')).toBeVisible();

  // Bozuk dosya reddedilir
  await page.goto('/#/settings?section=data');
  await page.getByTestId('restore-input').setInputFiles({ name: 'bozuk.zip', mimeType: 'application/zip', buffer: Buffer.from([0x50, 0x4b, 1, 2, 3, 4]) });
  await expect(page.getByText('Yedek bozuk ya da eksik.', { exact: false })).toBeVisible();
  await page.goto('/#/notes');
  await expect(page.getByText('Yedek testi notu')).toBeVisible();
});

test('şifreli yedek: parola olmadan açılmaz', async ({ page }) => {
  await openApp(page);
  await importMarkdown(page);
  await page.goto('/#/settings?section=data');
  await page.getByRole('switch', { name: 'Yedeği parolayla şifrele' }).click();
  await page.getByLabel('Parola (en az 8 karakter)').fill('cokgizli99');
  await page.getByLabel('Parolayı tekrar yaz').fill('cokgizli99');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Yedeği oluştur ve indir' }).click();
  const file = await (await dl).path();
  await page.getByTestId('restore-input').setInputFiles(file);
  await page.getByLabel('Yedek parolası').fill('yanlisparola');
  await page.getByRole('button', { name: 'Kilidi aç' }).click();
  await expect(page.getByText('Yedek parolası gerekli ya da yanlış.', { exact: false })).toBeVisible();
  await page.getByLabel('Yedek parolası').fill('cokgizli99');
  await page.getByRole('button', { name: 'Kilidi aç' }).click();
  await expect(page.getByRole('dialog', { name: 'Geri yükleme önizlemesi' })).toContainText('Şifreli');
});
