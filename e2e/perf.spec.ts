import { expect, test } from '@playwright/test';
import { importFiles, makeTextPdf, openApp } from './helpers';

// Performans bütçeleri (NexLearn.md §16). CI donanımı değişken olduğundan ölçümler raporlanır ve
// bütçe aşımı testi başarısız kılar.
test('soğuk açılış < 2 sn (masaüstü bütçesi)', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'NexLearn’e hoş geldin' })).toBeVisible();
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'ölçüm', description: `soğuk açılış ${ms} ms` });
  expect(ms).toBeLessThan(2000);
});

test('100 sayfalık metin katmanlı PDF içe aktarma < 10 sn', async ({ page }) => {
  test.setTimeout(60_000);
  const pages = Array.from({ length: 100 }, (_, i) => [
    `Chapter ${i + 1}`,
    '',
    ...Array.from({ length: 30 }, (_, j) => `Line ${j + 1} of page ${i + 1}: packets, routers, protocols and layers in a network.`),
  ]);
  const pdf = await makeTextPdf(pages);
  await openApp(page);
  const t0 = Date.now();
  const dialog = await importFiles(page, [{ name: 'big.pdf', mimeType: 'application/pdf', buffer: pdf }]);
  await expect(dialog.getByText('Hazır')).toBeVisible({ timeout: 30_000 });
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'ölçüm', description: `100 sayfa içe aktarma ${ms} ms` });
  expect(ms).toBeLessThan(10_000);
});
