import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { importFiles, importMarkdown, openApp, selectText } from './helpers';
import { makeEpub } from '../src/tests/fixtures';

test('EPUB içe aktarma: bölümler başlık olarak gelir, kitap adı kaynak adı olur', async ({ page }) => {
  await openApp(page);
  const epub = makeEpub(
    [
      { title: 'Birinci Bölüm', body: '<p>TCP güvenilir iletim sağlar.</p>' },
      { title: 'İkinci Bölüm', body: '<p>UDP bağlantısızdır.</p>' },
    ],
    { title: 'Ağlar Kitabı' },
  );
  const dialog = await importFiles(page, [{ name: 'kitap.epub', mimeType: 'application/epub+zip', buffer: Buffer.from(epub) }]);
  await expect(dialog.getByText('Hazır')).toBeVisible();
  await dialog.getByRole('button', { name: 'Okumaya başla' }).click();
  await expect(page.getByRole('heading', { name: 'İkinci Bölüm' })).toBeVisible();
  await expect(page.locator('.reading')).toContainText('UDP bağlantısızdır.');
  await expect(page.getByRole('heading', { level: 1, name: 'Ağlar Kitabı' })).toBeVisible();
});

test('kavram önerileri ve sınav provası (tekrar planı değişmez)', async ({ page }) => {
  await openApp(page);
  await importMarkdown(page);

  // Modelsiz kavram önerisi → kavram olarak ekle
  await page.getByRole('tab', { name: 'Kavramlar' }).click();
  await page.getByRole('button', { name: 'Kavram önerilerini göster' }).click();
  const box = page.locator('.keyword-box');
  await expect(box).toBeVisible();
  const addUdp = box.getByRole('button', { name: /"UDP" kavramını ekle/ });
  await expect(addUdp).toBeVisible();
  await addUdp.click();
  await expect(page.getByText('"UDP" kavram olarak eklendi.')).toBeVisible();
  await expect(box.getByRole('button', { name: /"UDP" kavramını ekle/ })).toHaveCount(0);

  // Bir kart oluştur
  await selectText(page, 'bağlantısızdır');
  await page.getByRole('toolbar', { name: 'Seçim araçları' }).getByRole('button', { name: 'Kart oluştur' }).click();
  const cardDialog = page.getByRole('dialog', { name: 'Yeni kart' });
  await cardDialog.getByLabel('Soru').fill('UDP bağlantı kurar mı?');
  await cardDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('İlk kartın hazır!')).toBeVisible();

  // Prova
  await page.goto('/#/review?tab=practice');
  await page.getByRole('button', { name: 'Provayı başlat' }).click();
  await expect(page.getByRole('heading', { name: 'UDP bağlantı kurar mı?' })).toBeVisible();
  await page.getByLabel('Cevabı hatırlamaya çalış…').fill('kurmaz');
  await page.getByRole('button', { name: 'Cevabı Göster' }).click();
  await page.getByRole('button', { name: 'Bildim' }).click();
  await expect(page.getByRole('heading', { name: 'Prova bitti' })).toBeVisible();
  await expect(page.getByText('%100')).toBeVisible();

  // Tekrar planı değişmedi: kart bugün hâlâ sırada
  await page.goto('/#/review');
  await expect(page.getByRole('heading', { name: 'UDP bağlantı kurar mı?' })).toBeVisible();
});

test('eminlik sorusu açıkken cevap öncesi eminlik seçilir', async ({ page }) => {
  await openApp(page);
  await importMarkdown(page);
  await selectText(page, 'bağlantısızdır');
  await page.getByRole('toolbar', { name: 'Seçim araçları' }).getByRole('button', { name: 'Kart oluştur' }).click();
  const cardDialog = page.getByRole('dialog', { name: 'Yeni kart' });
  await cardDialog.getByLabel('Soru').fill('UDP nasıldır?');
  await cardDialog.getByRole('button', { name: 'Kaydet' }).click();

  await page.goto('/#/settings?section=review');
  await page.getByRole('switch', { name: 'Cevaptan önce eminliğimi sor' }).click();
  await expect(page.getByRole('switch', { name: 'Cevaptan önce eminliğimi sor' })).toBeChecked();

  await page.goto('/#/review');
  await page.locator('.confidence-option', { hasText: 'Kesin biliyorum' }).click();
  await expect(page.getByRole('radio', { name: 'Kesin biliyorum' })).toBeChecked();
  await page.getByRole('button', { name: 'Cevabı Göster' }).click();
  await page.getByRole('button', { name: /Tekrar/ }).first().click();

  await page.goto('/#/progress');
  await page.getByRole('tab', { name: /Tekrar/ }).click();
  await expect(page.getByRole('heading', { name: 'Emin olup yanlış bildiklerin' })).toBeVisible();
  await expect(page.getByText('UDP nasıldır?')).toBeVisible();
});

test('OCR: görseldeki yazı yerel olarak tanınır', async ({ page }) => {
  test.setTimeout(150_000);
  await openApp(page);
  // Tarayıcıda yazılı bir görsel üret
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 220;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    g.font = '48px sans-serif';
    g.fillText('Network protocols matter', 30, 90);
    g.fillText('TCP is reliable', 30, 170);
    return c.toDataURL('image/png');
  });
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  const dialog = await importFiles(page, [{ name: 'tarama.png', mimeType: 'image/png', buffer: png }]);
  await expect(dialog.getByText('Hazır')).toBeVisible();
  await dialog.getByRole('button', { name: 'Okumaya başla' }).click();

  await page.getByLabel('Belge dili').selectOption('eng');
  await page.getByRole('button', { name: 'Metni tanı' }).click();
  await expect(page.getByText(/bölüm tanındı/)).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.reading')).toContainText(/reliable/i);
  await expect(page.locator('.ocr-notice')).toBeVisible();
});

test('eşli öğrenme: meydan okuma dosyası → çöz → cevap dosyası → karşılaştırma', async ({ page }) => {
  await openApp(page);
  await importMarkdown(page);
  await selectText(page, 'bağlantısızdır');
  await page.getByRole('toolbar', { name: 'Seçim araçları' }).getByRole('button', { name: 'Kart oluştur' }).click();
  const cardDialog = page.getByRole('dialog', { name: 'Yeni kart' });
  await cardDialog.getByLabel('Soru').fill('UDP nasıldır?');
  await cardDialog.getByRole('button', { name: 'Kaydet' }).click();

  await page.goto('/#/review?tab=practice');
  await page.getByRole('button', { name: 'Arkadaşına meydan oku' }).click();
  const dlg = page.getByRole('dialog', { name: 'Meydan okuma oluştur' });
  await dlg.getByLabel('Meydan okuma adı').fill('Ağ düellosu');
  await dlg.getByLabel('Adın').fill('Ayşe');
  const [challengeDl] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Dosyayı oluştur' }).click()]);
  expect(challengeDl.suggestedFilename()).toBe('ag-duellosu.nexduel');
  const challenge = readFileSync((await challengeDl.path())!);

  // Arkadaşın cihazı: temiz bir bağlam
  const friend = await page.context().browser()!.newPage();
  await openApp(friend);
  await friend.goto('/#/review?tab=duel');
  await friend.getByTestId('duel-input').setInputFiles([{ name: 'ag-duellosu.nexduel', mimeType: 'application/json', buffer: challenge }]);
  await expect(friend.getByText('Ayşe · 1 soru')).toBeVisible();
  await friend.getByLabel('Adın').fill('Mehmet');
  await friend.getByRole('button', { name: 'Çöz', exact: true }).click();
  await friend.getByRole('button', { name: 'Cevabı Göster' }).click();
  const [answerDl] = await Promise.all([friend.waitForEvent('download'), friend.getByRole('button', { name: 'Bildim' }).click()]);
  expect(answerDl.suggestedFilename()).toBe('ag-duellosu.nexduel-cevap');
  const answer = readFileSync((await answerDl.path())!);
  await friend.close();

  await page.goto('/#/review?tab=duel');
  await page.getByTestId('duel-input').setInputFiles([{ name: 'ag-duellosu.nexduel-cevap', mimeType: 'application/json', buffer: answer }]);
  await expect(page.getByRole('table', { name: 'Ağ düellosu karşılaştırması' })).toContainText('Mehmet · %100');
});

test('Zihin: tek düğme; dosya doğrulanır, geçersiz model güvenle reddedilir', async ({ page }) => {
  await openApp(page, '/settings?section=zihin');
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Zihin (yerel yapay zekâ)' }) });
  await expect(section).toContainText('Tamamen bu cihazda çalışır');
  // Kullanıcı yalnızca tek düğme görür; çalışma zamanı uygulamayla gelir
  await expect(section.getByRole('button', { name: 'Zihin’i etkinleştir' })).toBeVisible();
  await expect(section).not.toContainText('wllama');

  await section.getByText('Gelişmiş').click();
  await section.getByTestId('zihin-file').setInputFiles([{ name: 'sahte.gguf', mimeType: 'application/octet-stream', buffer: Buffer.from('bu bir model değil') }]);
  await expect(page.getByText('Zihin paketi geçersiz.', { exact: false })).toBeVisible();

  // Geçerli başlıklı ama bozuk model: otomatik başlatılır ve güvenle reddedilir (motor gerçekten yüklenir)
  const fake = Buffer.concat([Buffer.from('GGUF'), Buffer.alloc(2048, 1)]);
  await section.getByTestId('zihin-file').setInputFiles([{ name: 'deneme.gguf', mimeType: 'application/octet-stream', buffer: fake }]);
  await expect(page.getByText('Model çalıştırılamadı.', { exact: false })).toBeVisible({ timeout: 60_000 });
  await expect(section).toContainText('deneme.gguf');
  await section.getByRole('button', { name: 'Zihin dosyalarını sil' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await expect(section).not.toContainText('deneme.gguf');
});
