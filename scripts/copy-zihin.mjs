// Zihin çalışma zamanını (wllama.wasm) public/zihin altına kopyalar. Tüm derlemelerde uygulamayla gelir
// (~8 MB, sıkıştırılınca ~3 MB); yalnızca Zihin başlatılınca yüklenir, ön önbelleğe alınmaz.
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/zihin', { recursive: true });
copyFileSync('node_modules/@wllama/wllama/esm/wasm/wllama.wasm', 'public/zihin/wllama.wasm');
