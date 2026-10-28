// Uygulama simgelerini SVG kaynağından PNG olarak üretir (Playwright/Chromium ile).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const jobs = [
  ['scripts/icon-tile.svg', 'public/icons/icon-192.png', 192],
  ['scripts/icon-tile.svg', 'public/icons/icon-512.png', 512],
  ['scripts/icon-maskable.svg', 'public/icons/icon-maskable-512.png', 512],
  ['scripts/icon-tile.svg', 'src-tauri/app-icon.png', 1024],
];
mkdirSync('public/icons', { recursive: true });
mkdirSync('src-tauri', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = readFileSync(src, 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  writeFileSync(out, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log('wrote', out);
}
await browser.close();
