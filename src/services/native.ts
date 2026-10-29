import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Android kabuğundaki yerel yardımcılar (android/app/.../NexNativePlugin.java). Web ve masaüstünde etkisizdir. */
interface SharedFile {
  path: string;
  name: string;
  mimeType: string;
  size: number;
}
interface NexNativePlugin {
  takeSharedFiles(): Promise<{ files: SharedFile[] }>;
  releaseShared(): Promise<void>;
  appInfo(): Promise<{ version: string; canInstall: boolean }>;
  downloadAndInstall(opts: { url: string; checksumsUrl: string; fileName: string }): Promise<void>;
  addListener(event: 'sharedFiles', fn: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'updateProgress', fn: (p: { downloaded: number; total: number }) => void): Promise<PluginListenerHandle>;
}

const NexNative = registerPlugin<NexNativePlugin>('NexNative');

export function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** Paylaş menüsünden gelen dosyaları File olarak alır; önbellekteki kopyalar sonra silinir. */
export async function takeSharedFiles(): Promise<File[]> {
  if (!isAndroid()) return [];
  const { files } = await NexNative.takeSharedFiles();
  const out: File[] = [];
  for (const f of files) {
    const res = await fetch(Capacitor.convertFileSrc(f.path));
    out.push(new File([await res.blob()], f.name, { type: f.mimeType }));
  }
  if (files.length) await NexNative.releaseShared().catch(() => undefined);
  return out;
}

export async function onSharedFiles(fn: () => void): Promise<() => void> {
  if (!isAndroid()) return () => undefined;
  const h = await NexNative.addListener('sharedFiles', fn);
  return () => void h.remove();
}

export async function androidInstall(opts: { url: string; checksumsUrl: string; fileName: string }, onProgress: (f: number) => void): Promise<void> {
  const h = await NexNative.addListener('updateProgress', (p) => {
    if (p.total > 0) onProgress(p.downloaded / p.total);
  });
  try {
    await NexNative.downloadAndInstall(opts);
  } finally {
    void h.remove();
  }
}
