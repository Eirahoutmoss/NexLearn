import { expect, test } from '@playwright/test';
import { importMarkdown, importFiles, openApp, selectText } from './helpers';

test('ilk açılış: tanıtım, boş durum ve hesap istenmemesi', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'NexLearn’e hoş geldin' });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText(/e-posta adresi|kayıt ol|giriş yap/i);
  await dialog.getByRole('button', { name: 'İleri' }).click();
  await dialog.getByRole('button', { name: 'İleri' }).click();
  await dialog.getByRole('button', { name: 'Şimdilik geç' }).click();
  await expect(page.getByText('Öğrenme alanın hazır')).toBeVisible();
  // Ayarın yerel veritabanına yazıldığını doğrula, sonra yeniden yükle.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const req = indexedDB.open('nexlearn');
            req.onsuccess = () => {
              const get = req.result.transaction('settings').objectStore('settings').get('app');
              get.onsuccess = () => resolve(Boolean(get.result?.onboardingDone));
              get.onerror = () => resolve(false);
            };
            req.onerror = () => resolve(false);
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'NexLearn’e hoş geldin' })).toBeHidden();
});

test('dikey dilim: içe aktar → oku → vurgula → not → kart → tekrar → geçmiş', async ({ page }) => {
  await openApp(page);
  await importMarkdown(page);
  await expect(page.getByRole('heading', { name: 'Ağ Protokolleri' })).toBeVisible();

  // Vurgu
  await selectText(page, 'güvenilir ve sıralı iletim');
  const toolbar = page.getByRole('toolbar', { name: 'Seçim araçları' });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: 'Tanım olarak vurgula' }).click();
  await expect(page.locator('mark.hl-definition')).toHaveText('güvenilir ve sıralı iletim');

  // Not (seçimden)
  await selectText(page, 'düşük gecikme');
  await toolbar.getByRole('button', { name: 'Not ekle' }).click();
  const noteDialog = page.getByRole('dialog', { name: 'Not ekle' });
  await noteDialog.getByLabel('Notun').fill('Oyunlar ve canlı yayın #ağ');
  await noteDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.locator('.reader-panel')).toContainText('Oyunlar ve canlı yayın');

  // Kart (seçimden; cevap seçimle önceden doldurulur)
  await selectText(page, 'bağlantısızdır');
  await toolbar.getByRole('button', { name: 'Kart oluştur' }).click();
  const cardDialog = page.getByRole('dialog', { name: 'Yeni kart' });
  await expect(cardDialog.getByLabel('Cevap')).toHaveValue('bağlantısızdır');
  await expect(cardDialog).toContainText('protokoller');
  await cardDialog.getByLabel('Soru').fill('UDP bağlantı kurar mı?');
  await cardDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('İlk kartın hazır!')).toBeVisible();

  // Konum kalıcılığı
  await page.reload();
  await expect(page.locator('mark.hl-definition')).toBeVisible();

  // Tekrar
  await page.goto('/#/review');
  await expect(page.getByRole('heading', { name: 'UDP bağlantı kurar mı?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cevabı Göster' }).click();
  await expect(page.locator('.answer-text')).toHaveText('bağlantısızdır');
  await expect(page.locator('.answer-source a')).toContainText('protokoller');
  await page.getByRole('button', { name: /Normal/ }).click();
  await expect(page.getByRole('heading', { name: 'Bugünlük bu kadar' })).toBeVisible();
  await expect(page.locator('.review-reason')).toContainText('ilk kez doğru hatırladın');

  await page.goto('/#/review?tab=history');
  await expect(page.getByText('UDP bağlantı kurar mı?')).toBeVisible();
  await expect(page.getByText('0 g → 1 g')).toBeVisible();

  // Kaynaktan karta dönüş: kaynak bağlantısı okuma alanında doğru segmente götürür
  await page.goto('/#/notes');
  await expect(page.getByText('Oyunlar ve canlı yayın')).toBeVisible();
});

test('klavye: paragraf gezinme ve kısayolla not', async ({ page }) => {
  await openApp(page);
  await importMarkdown(page);
  await page.locator('.seg').first().focus();
  await page.keyboard.press('j');
  await expect(page.locator('.seg').nth(1)).toBeFocused();
  await page.keyboard.press('n');
  const noteDialog = page.getByRole('dialog', { name: 'Not ekle' });
  await expect(noteDialog.getByLabel('Notun')).toBeFocused();
  await page.keyboard.type('Klavyeyle eklendi');
  await noteDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.locator('.reader-panel')).toContainText('Klavyeyle eklendi');
  // Enter ile paragraf eylem menüsü
  await page.locator('.seg').nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('toolbar', { name: 'Seçim araçları' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: 'Seçim araçları' })).toBeHidden();
});

test('komut paleti: Türkçe normalleştirilmiş arama sonuca götürür', async ({ page }) => {
  await openApp(page);
  await importMarkdown(page);
  await page.goto('/#/');
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Ara ve komut çalıştır' });
  await palette.getByRole('combobox').fill('cigdem ogrenciler');
  await expect(palette.getByRole('option').first()).toContainText('Çiğdem öğrenciler');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/read\//);
  await expect(page.locator('.seg-flash, .seg:focus')).toContainText('Çiğdem');
});

test('hatalı ve desteklenmeyen dosyalar açık hata verir', async ({ page }) => {
  await openApp(page);
  const dialog = await importFiles(page, [
    { name: 'arsiv.zip', mimeType: 'application/zip', buffer: Buffer.from([0x50, 0x4b, 3, 4, 1, 2, 3]) },
    { name: 'belge.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('abc') },
    { name: 'bos.txt', mimeType: 'text/plain', buffer: Buffer.from('   ') },
  ]);
  await expect(dialog.getByText('Sıkıştırılmış arşivler (ZIP vb.) desteklenmiyor.', { exact: false })).toBeVisible();
  await expect(dialog.getByText('Bu dosya türü desteklenmiyor.', { exact: false })).toBeVisible();
  await expect(dialog.getByText('İçerik çıkarılamadı', { exact: false }).first()).toBeVisible();
});

test('kavram haritası: kavram, ilişki, döngü kuralı ve liste görünümü', async ({ page }) => {
  await openApp(page, '/map');
  for (const label of ['IP', 'TCP']) {
    await page.getByRole('button', { name: 'Yeni kavram' }).first().click();
    const d = page.getByRole('dialog', { name: 'Yeni kavram' });
    await d.getByLabel('Kavram adı').fill(label);
    await d.getByRole('button', { name: 'Kaydet' }).click();
    await expect(d).toBeHidden();
  }
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await page.getByRole('button', { name: 'IP' }).first().click();
  const detail = page.locator('.concept-detail');
  await detail.getByLabel('İlişki türü').last().selectOption('prerequisite_of');
  await detail.getByLabel('Hedef kavram').selectOption({ label: 'TCP' });
  await detail.getByRole('button', { name: 'İlişki ekle' }).click();
  await expect(page.locator('.relation-lines').first()).toContainText('ön koşuludur');
  // Döngü: TCP → IP ön koşul eklenemez
  await page.getByRole('button', { name: 'TCP' }).first().click();
  await detail.getByLabel('İlişki türü').last().selectOption('prerequisite_of');
  await detail.getByLabel('Hedef kavram').selectOption({ label: 'IP' });
  await detail.getByRole('button', { name: 'İlişki ekle' }).click();
  await expect(page.getByText('Bu ilişki bir döngü oluşturur.', { exact: false })).toBeVisible();
  // Harita görünümü düğümleri çizer
  await page.getByRole('button', { name: 'Harita', exact: true }).click();
  await expect(page.locator('.map-node')).toHaveCount(2);
});
