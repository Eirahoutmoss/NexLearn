// Web derlemesinde Zihin çalışma zamanını (wllama.wasm) public/zihin altına kopyalar.
// Masaüstü ve Android derlemelerinde kopyalanmaz: orada çalışma zamanı Zihin paketiyle birlikte indirilir,
// böylece çekirdek uygulamanın boyutu artmaz.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

const native = Boolean(process.env.TAURI_ENV_PLATFORM) || process.env.NEX_TARGET === 'android';
rmSync('public/zihin', { recursive: true, force: true });
if (!native) {
  mkdirSync('public/zihin', { recursive: true });
  copyFileSync('node_modules/@wllama/wllama/esm/wasm/wllama.wasm', 'public/zihin/wllama.wasm');
  console.log('Zihin çalışma zamanı web derlemesine eklendi');
}
