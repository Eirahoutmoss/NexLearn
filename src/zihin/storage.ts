import { AppError } from '../domain/errors';
import { isTauri } from '../services/update';
import { ZIHIN_MANIFEST_URL, parseManifest, type ZihinFileRef, type ZihinManifest } from './manifest';

/**
 * Zihin dosyalarının (çalışma zamanı .wasm + model .gguf) platforma göre saklanması.
 * - Masaüstü: Rust indirir ve doğrular → uygulama klasörü → asset protokolüyle okunur.
 * - Android: Java indirir ve doğrular → uygulama klasörü → Capacitor dosya adresiyle okunur.
 * - Web: kullanıcının seçtiği model tarayıcının özel dosya alanında (OPFS) tutulur.
 * Çalışma zamanı (wllama.wasm, ~3 MB sıkıştırılmış) tüm derlemelerde uygulamayla birlikte gelir
 * ve yalnızca Zihin başlatılınca yüklenir; kullanıcı hiçbir zaman bu dosyayla uğraşmaz.
 */
export interface ZihinLocal {
  runtimeUrl: string | null;
  model: { name: string; size: number; load: () => Promise<Blob> } | null;
}

type Platform = 'desktop' | 'android' | 'web';

async function platform(): Promise<Platform> {
  if (isTauri()) return 'desktop';
  const { isAndroid } = await import('../services/native');
  return isAndroid() ? 'android' : 'web';
}

export async function zihinPlatform(): Promise<Platform> {
  return platform();
}

/* ---------- Manifest ---------- */

export async function fetchManifest(): Promise<ZihinManifest> {
  const p = await platform();
  let text: string;
  try {
    if (p === 'desktop') {
      const { invoke } = await import('@tauri-apps/api/core');
      text = await invoke<string>('zihin_fetch_manifest', { url: ZIHIN_MANIFEST_URL });
    } else if (p === 'android') {
      const { zihinFetchText } = await import('../services/native');
      text = await zihinFetchText(ZIHIN_MANIFEST_URL);
    } else {
      throw new AppError('ZHN-002', 'web-download');
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('NET-001', 'zihin-manifest');
  }
  return parseManifest(text);
}

/* ---------- İndirme (masaüstü / Android) ---------- */

export async function downloadFile(ref: ZihinFileRef, onProgress: (f: number) => void): Promise<void> {
  const p = await platform();
  if (p === 'desktop') {
    const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]);
    const off = await listen<{ name: string; downloaded: number; total: number }>('zihin-progress', (e) => {
      if (e.payload.name === ref.name && e.payload.total > 0) onProgress(e.payload.downloaded / e.payload.total);
    });
    try {
      await invoke('zihin_download', { url: ref.url, fileName: ref.name, sha256: ref.sha256, size: ref.size });
    } catch (e) {
      throw new AppError('ZHN-003', typeof e === 'string' ? e.slice(0, 40) : 'download');
    } finally {
      off();
    }
    await moveDesktopModelToOpfs();
    return;
  }
  if (p === 'android') {
    const { zihinDownload } = await import('../services/native');
    try {
      await zihinDownload(ref, onProgress);
    } catch (e) {
      throw new AppError('ZHN-003', e instanceof Error ? e.message.slice(0, 40) : 'download');
    }
    return;
  }
  throw new AppError('ZHN-002', 'web-download');
}

/* ---------- OPFS (web ve elle yükleme) ---------- */

const OPFS_DIR = 'zihin';

async function opfsDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR, { create: true });
  } catch {
    return null;
  }
}

async function opfsFiles(): Promise<File[]> {
  const dir = await opfsDir();
  if (!dir) return [];
  const out: File[] = [];
  for await (const handle of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    if (handle.kind === 'file') out.push(await (handle as FileSystemFileHandle).getFile());
  }
  return out;
}

/** Kullanıcının seçtiği .gguf ya da .wasm dosyasını saklar (varsa aynı türdeki eskisinin yerine). */
export async function importLocalFile(file: File): Promise<void> {
  const ext = /\.gguf$/i.test(file.name) ? 'gguf' : /\.wasm$/i.test(file.name) ? 'wasm' : null;
  if (!ext) throw new AppError('ZHN-001', 'file-type');
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const magicOk = ext === 'gguf' ? head[0] === 0x47 && head[1] === 0x47 && head[2] === 0x55 && head[3] === 0x46 : head[0] === 0x00 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d;
  if (!magicOk) throw new AppError('ZHN-001', 'magic');
  const dir = await opfsDir();
  if (!dir) throw new AppError('ZHN-004', 'opfs');
  for (const f of await opfsFiles()) if (f.name.toLowerCase().endsWith(`.${ext}`)) await dir.removeEntry(f.name).catch(() => undefined);
  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160);
  const handle = await dir.getFileHandle(safe, { create: true });
  const w = await (handle as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
  try {
    await file.stream().pipeTo(w);
  } catch {
    throw new AppError('DB-002', 'opfs-write');
  }
}

/**
 * Masaüstü: Rust'ın indirip doğruladığı modeli 32 MB'lık parçalarla tarayıcının özel dosya alanına (OPFS)
 * taşır ve uygulama klasöründeki kopyayı siler. Model böylece diskte durur ve yüklenirken bir kerede
 * belleğe okunmaz (büyük dosyaları asset protokolüyle tek seferde çekmek WebView2'de başarısız olabiliyor).
 */
export async function moveDesktopModelToOpfs(onProgress?: (f: number) => void): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const files = await invoke<{ name: string; size: number; path: string }[]>('zihin_files').catch(() => []);
  const model = files.find((f) => f.name.toLowerCase().endsWith('.gguf'));
  if (!model) return;
  const dir = await opfsDir();
  if (!dir) throw new AppError('ZHN-004', 'opfs');
  for (const f of await opfsFiles()) if (f.name.toLowerCase().endsWith('.gguf')) await dir.removeEntry(f.name).catch(() => undefined);
  const handle = await dir.getFileHandle(model.name, { create: true });
  const w = await (handle as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
  const CHUNK = 32 * 1024 * 1024;
  try {
    for (let offset = 0; offset < model.size; offset += CHUNK) {
      const len = Math.min(CHUNK, model.size - offset);
      const buf = await invoke<ArrayBuffer>('zihin_read', { name: model.name, offset, len });
      await w.write(new Uint8Array(buf));
      onProgress?.((offset + len) / model.size);
    }
    await w.close();
  } catch (e) {
    await w.abort().catch(() => undefined);
    await dir.removeEntry(model.name).catch(() => undefined);
    throw new AppError('ZHN-003', `opfs-copy:${e instanceof Error ? e.name : String(e).slice(0, 30)}`);
  }
  const copied = await (await dir.getFileHandle(model.name)).getFile();
  if (copied.size !== model.size) throw new AppError('ZHN-003', 'opfs-size');
  await invoke('zihin_remove').catch(() => undefined);
}

/* ---------- Yerel durum ---------- */

export async function localStatus(): Promise<ZihinLocal> {
  const p = await platform();
  const opfs = await opfsFiles();
  const opfsModel = opfs.find((f) => /\.gguf$/i.test(f.name));
  const opfsWasm = opfs.find((f) => /\.wasm$/i.test(f.name));
  let runtimeUrl: string | null = opfsWasm ? URL.createObjectURL(opfsWasm) : null;
  let model: ZihinLocal['model'] = opfsModel ? { name: opfsModel.name, size: opfsModel.size, load: async () => opfsModel } : null;

  if (p === 'desktop') {
    const { invoke } = await import('@tauri-apps/api/core');
    const files = await invoke<{ name: string; size: number; path: string }[]>('zihin_files').catch(() => []);
    const m = files.find((f) => f.name.endsWith('.gguf'));
    // Eski sürümlerin uygulama klasörüne indirdiği model ilk kullanımda OPFS'ye taşınır.
    if (m && !model)
      model = {
        name: m.name,
        size: m.size,
        load: async () => {
          await moveDesktopModelToOpfs();
          const f = (await opfsFiles()).find((x) => x.name === m.name);
          if (!f) throw new AppError('ZHN-004', 'opfs-missing');
          return f;
        },
      };
  } else if (p === 'android') {
    const { zihinFiles, fileUrl } = await import('../services/native');
    const files = await zihinFiles().catch(() => []);
    const w = files.find((f) => f.name.endsWith('.wasm'));
    const m = files.find((f) => f.name.endsWith('.gguf'));
    if (w) runtimeUrl = fileUrl(w.path);
    if (m) model = { name: m.name, size: m.size, load: async () => (await fetch(fileUrl(m.path))).blob() };
  }
  // Uygulamayla gelen çalışma zamanı (elle seçilmiş ya da indirilmiş bir sürüm yoksa).
  if (!runtimeUrl) runtimeUrl = new URL(`${import.meta.env.BASE_URL}zihin/wllama.wasm`, document.baseURI).href;
  return { runtimeUrl, model };
}

export async function removeLocal(): Promise<void> {
  const p = await platform();
  const dir = await opfsDir();
  if (dir) for (const f of await opfsFiles()) await dir.removeEntry(f.name).catch(() => undefined);
  if (p === 'desktop') {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('zihin_remove').catch(() => undefined);
  } else if (p === 'android') {
    const { zihinRemove } = await import('../services/native');
    await zihinRemove().catch(() => undefined);
  }
}
