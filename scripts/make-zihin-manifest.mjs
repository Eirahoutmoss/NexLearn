#!/usr/bin/env node
// Zihin paketi manifestini üretir. Kullanım:
//   node scripts/make-zihin-manifest.mjs <model.gguf> --id qwen3-0-6b --label "Qwen3 0.6B (önerilen)" \
//        --license Apache-2.0 --langs tr,en --ctx 4096 [<model2.gguf> --id ... ] [--out dist-zihin]
// Çıktı klasörüne (varsayılan: dist-zihin) wllama.wasm kopyalanır ve zihin-manifest.json yazılır.
// Ardından bu klasördeki tüm dosyalar GitHub'da "zihin-v1" etiketli sürüme yüklenir (bkz. docs/ZIHIN.md).
import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const TAG = 'zihin-v1';
const BASE = `https://github.com/Eirahoutmoss/NexLearn/releases/download/${TAG}/`;
const args = process.argv.slice(2);
let out = 'dist-zihin';
const models = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') out = args[++i];
  else if (a.startsWith('--')) {
    const m = models.at(-1);
    if (!m) throw new Error(`${a} bir model dosyasından sonra gelmeli`);
    m[a.slice(2)] = args[++i];
  } else models.push({ path: a });
}
if (!models.length) {
  console.error('En az bir .gguf model dosyası verin. Ayrıntı: docs/ZIHIN.md');
  process.exit(1);
}

const sha256 = (p) =>
  new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(p).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
const safe = (n) => {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(n) || n.includes('..')) throw new Error(`Geçersiz dosya adı: ${n} (yalnızca harf, rakam, . _ -)`);
  return n;
};

mkdirSync(out, { recursive: true });
const wasmSrc = 'node_modules/@wllama/wllama/esm/wasm/wllama.wasm';
const wasmName = 'wllama.wasm';
copyFileSync(wasmSrc, join(out, wasmName));
const pkg = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync('node_modules/@wllama/wllama/package.json', 'utf8')));

const manifest = {
  format: 'nexlearn-zihin',
  formatVersion: 1,
  runtime: { engine: 'wllama', version: pkg.version, name: wasmName, url: BASE + wasmName, size: statSync(join(out, wasmName)).size, sha256: await sha256(join(out, wasmName)) },
  models: [],
};
for (const m of models) {
  const name = safe(basename(m.path));
  if (!/\.gguf$/i.test(name)) throw new Error(`${name}: .gguf bekleniyor`);
  if (!m.id || !/^[a-z0-9-]{1,40}$/.test(m.id)) throw new Error(`${name}: --id küçük harf, rakam ve tire olmalı`);
  console.log(`Özet hesaplanıyor: ${name}…`);
  manifest.models.push({
    id: m.id,
    label: m.label ?? m.id,
    license: m.license ?? '',
    languages: (m.langs ?? '').split(',').filter(Boolean),
    contextLength: Number(m.ctx ?? 4096),
    ...(m.tier ? { tier: m.tier } : {}),
    ...(m.ram ? { minRamGB: Number(m.ram) } : {}),
    name,
    url: BASE + name,
    size: statSync(m.path).size,
    sha256: await sha256(m.path),
  });
}
writeFileSync(join(out, 'zihin-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nHazır: ${out}/zihin-manifest.json`);
console.log(`Yüklenecek dosyalar: ${[wasmName, 'zihin-manifest.json', ...manifest.models.map((m) => m.name)].join(', ')}`);
console.log(`Not: model dosyalarını (${manifest.models.map((m) => m.name).join(', ')}) kendi bulunduğu yerden yükleyin; bu klasöre kopyalanmadı.`);
