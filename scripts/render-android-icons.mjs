// Android simgelerini ve açılış görsellerini SVG kaynaklarından üretir (Playwright/Chromium ile).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const RES = 'android/app/src/main/res';
const BG = '#FBF5EC';
const tile = readFileSync('scripts/icon-tile.svg', 'utf8');
const maskable = readFileSync('scripts/icon-maskable.svg', 'utf8');
const fg = readFileSync('scripts/icon-foreground.svg', 'utf8');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const splash = {
  'drawable': [480, 320],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
};

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(html, w, h, out, transparent = true) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : BG};width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;overflow:hidden">${html}</body></html>`);
  writeFileSync(out, await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } }));
}
const sized = (svg, s, extra = '') => svg.replace('<svg ', `<svg width="${s}" height="${s}" ${extra}`);

for (const [d, k] of Object.entries(densities)) {
  const legacy = Math.round(48 * k);
  const fore = Math.round(108 * k);
  await render(sized(tile, legacy), legacy, legacy, `${RES}/mipmap-${d}/ic_launcher.png`);
  await render(`<div style="width:${legacy}px;height:${legacy}px;border-radius:50%;overflow:hidden">${sized(maskable, legacy)}</div>`, legacy, legacy, `${RES}/mipmap-${d}/ic_launcher_round.png`);
  await render(sized(fg, fore), fore, fore, `${RES}/mipmap-${d}/ic_launcher_foreground.png`);
}
for (const [dir, [w, h]] of Object.entries(splash)) {
  const s = Math.round(Math.min(w, h) * 0.5);
  await render(sized(fg, s), w, h, `${RES}/${dir}/splash.png`, false);
}
await browser.close();
console.log('Android simgeleri üretildi');
