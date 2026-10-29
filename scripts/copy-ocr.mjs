// OCR (Tesseract) çalışma zamanı dosyalarını public/ocr altına kopyalar: uygulama çevrimdışı ve yerel çalışır.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = 'public/ocr';
mkdirSync(out, { recursive: true });
const tjs = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json', { paths: [tjs] }));
const files = [
  [join(tjs, 'dist/worker.min.js'), 'worker.min.js'],
  [join(core, 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [join(dirname(require.resolve('@tesseract.js-data/tur/package.json')), '4.0.0_best_int/tur.traineddata.gz'), 'tur.traineddata.gz'],
  [join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int/eng.traineddata.gz'), 'eng.traineddata.gz'],
];
for (const [src, name] of files) {
  if (!existsSync(src)) throw new Error(`OCR dosyası bulunamadı: ${src}`);
  copyFileSync(src, join(out, name));
}
console.log(`OCR dosyaları kopyalandı → ${out}`);
