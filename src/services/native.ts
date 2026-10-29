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
  zihinFetchText(opts: { url: string }): Promise<{ text: string }>;
  zihinDownload(opts: { url: string; fileName: string; sha256: string; size: number }): Promise<void>;
  zihinFiles(): Promise<{ files: { name: string; size: number; path: string }[] }>;
  zihinRemove(): Promise<void>;
  addListener(event: 'sharedFiles', fn: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'zihinProgress', fn: (p: { name: string; downloaded: number; total: number }) => void): Promise<PluginListenerHandle>;
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

/* ---------- Zihin paketi dosyaları ---------- */

export function fileUrl(path: string): string {
  return Capacitor.convertFileSrc(path);
}

export async function zihinFetchText(url: string): Promise<string> {
  return (await NexNative.zihinFetchText({ url })).text;
}

export async function zihinDownload(ref: { url: string; name: string; sha256: string; size: number }, onProgress: (f: number) => void): Promise<void> {
  const h = await NexNative.addListener('zihinProgress', (p) => {
    if (p.name === ref.name && p.total > 0) onProgress(p.downloaded / p.total);
  });
  try {
    await NexNative.zihinDownload({ url: ref.url, fileName: ref.name, sha256: ref.sha256, size: ref.size });
  } finally {
    void h.remove();
  }
}

export async function zihinFiles(): Promise<{ name: string; size: number; path: string }[]> {
  return (await NexNative.zihinFiles()).files;
}

export async function zihinRemove(): Promise<void> {
  await NexNative.zihinRemove();
}
