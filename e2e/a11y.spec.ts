import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

async function loadSample(page: Page) {
  await page.goto('/');
  const d = page.getByRole('dialog', { name: 'NexLearn’e hoş geldin' });
  await d.getByRole('button', { name: 'İleri' }).click();
  await d.getByRole('button', { name: 'İleri' }).click();
  await d.getByRole('button', { name: 'Örnek içerikle dene' }).click();
  await expect(page.locator('.reading')).toBeVisible();
}

async function axe(page: Page) {
  // @axe-core/playwright kendi playwright-core tür sürümünü kullanır; çalışma zamanında aynı Page nesnesidir.
  const res = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return res.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

const ROUTES = ['/', '/library', '/review', '/review?tab=cards', '/review?tab=practice', '/review?tab=duel', '/map', '/map?view=list', '/notes', '/tasks', '/progress', '/settings', '/help'];

for (const theme of ['aydinlik', 'gece', 'kontrast'] as const) {
  test(`erişilebilirlik (axe, WCAG 2.2 AA) — ${theme}`, async ({ page }) => {
    await loadSample(page);
    await page.goto('/#/settings');
    await page.locator(`input[name=theme][value=${theme}]`).check({ force: true });
    const problems: string[] = [];
    // Okuma alanı
    await page.goto('/#/library');
    await page.locator('.source-card-link').first().click();
    await expect(page.locator('.reading')).toBeVisible();
    problems.push(...(await axe(page)).map((p) => `reader ${p}`));
    for (const r of ROUTES) {
      await page.goto(`/#${r}`);
      await page.waitForTimeout(300);
      problems.push(...(await axe(page)).map((p) => `${r} ${p}`));
    }
    expect(problems).toEqual([]);
  });
}

test('küçük ekran ve %200 yakınlaştırma: yatay taşma yok', async ({ browser }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 683, height: 430 }]) {
    const ctx = await browser.newContext({ viewport, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await loadSample(page);
    for (const r of ['/', '/library', '/review', '/map', '/progress', '/settings']) {
      await page.goto(`/#${r}`);
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${viewport.width}px ${r}`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  }
});

test('klavye: atlama bağlantısı ve modal odak yönetimi', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'İçeriğe geç' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  // Ctrl+K modalı açar; Esc kapatır ve odak geri döner
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Ara ve komut çalıştır' })).toBeHidden();
});
