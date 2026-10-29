import { AppError } from '../domain/errors';

/**
 * Güncelleme denetimi. Ağ isteği yalnızca kullanıcı düğmeye bastığında yapılır (otomatik ağ trafiği yok).
 * Masaüstü (Tauri): GitHub'daki son sürüm bulunur, kurulum dosyası SHA256SUMS ile doğrulanarak indirilir ve çalıştırılır.
 * Web/PWA: service worker yeni dosyaları denetler.
 */

export const REPO = 'Eirahoutmoss/NexLearn';
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
export const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function parseVersion(v: string): [number, number, number] | null {
  const m = v.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** a > b ise 1, eşitse 0, küçükse -1. Geçersiz sürüm "daha yeni değil" sayılır. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface ReleaseInfo {
  version: string;
  notes: string;
  publishedAt: string;
  pageUrl: string;
  installer?: ReleaseAsset;
  msi?: ReleaseAsset;
  checksums?: ReleaseAsset;
}

interface GithubRelease {
  tag_name?: unknown;
  body?: unknown;
  published_at?: unknown;
  html_url?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: { name?: unknown; browser_download_url?: unknown; size?: unknown }[];
}

/** GitHub yanıtını doğrular; yalnızca bu deponun indirme adreslerini kabul eder. */
export function parseRelease(raw: unknown): ReleaseInfo {
  const r = raw as GithubRelease;
  if (!r || typeof r.tag_name !== 'string' || !parseVersion(r.tag_name)) throw new AppError('UPD-001', 'tag');
  const assets: ReleaseAsset[] = (Array.isArray(r.assets) ? r.assets : [])
    .filter((a) => typeof a.name === 'string' && typeof a.browser_download_url === 'string' && (a.browser_download_url as string).startsWith(DOWNLOAD_PREFIX))
    .map((a) => ({ name: a.name as string, url: a.browser_download_url as string, size: typeof a.size === 'number' ? a.size : 0 }));
  const installer =
    assets.find((a) => /-setup\.exe$/i.test(a.name)) ?? assets.find((a) => /\.msi$/i.test(a.name)) ?? assets.find((a) => /\.exe$/i.test(a.name));
  const checksums = assets.find((a) => /^SHA256SUMS(\.txt)?$/i.test(a.name));
  return {
    version: (r.tag_name as string).replace(/^v/i, ''),
    notes: typeof r.body === 'string' ? r.body.slice(0, 4000) : '',
    publishedAt: typeof r.published_at === 'string' ? r.published_at : '',
    pageUrl: typeof r.html_url === 'string' && r.html_url.startsWith(`https://github.com/${REPO}/`) ? r.html_url : RELEASES_PAGE,
    installer,
    msi: assets.find((a) => /\.msi$/i.test(a.name)),
    checksums,
  };
}

export async function fetchLatestRelease(signal?: AbortSignal): Promise<ReleaseInfo> {
  let res: Response;
  try {
    res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, signal, cache: 'no-store' });
  } catch {
    throw new AppError('NET-001', 'fetch');
  }
  if (res.status === 404) throw new AppError('UPD-001', 'no-release');
  if (!res.ok) throw new AppError('NET-001', `http-${res.status}`);
  return parseRelease(await res.json());
}

export type UpdateCheck =
  | { status: 'up-to-date'; current: string; latest: ReleaseInfo }
  | { status: 'available'; current: string; latest: ReleaseInfo };

export async function checkForUpdate(current: string = __APP_VERSION__): Promise<UpdateCheck> {
  const latest = await fetchLatestRelease();
  return compareVersions(latest.version, current) > 0 ? { status: 'available', current, latest } : { status: 'up-to-date', current, latest };
}

/** Masaüstü: kurulum dosyasını indirir, SHA-256 ile doğrular ve kurucuyu başlatır (uygulama kapanır). */
export async function downloadAndInstall(release: ReleaseInfo, onProgress: (fraction: number) => void): Promise<void> {
  if (!isTauri()) throw new AppError('UPD-001', 'not-desktop');
  if (!release.installer || !release.checksums) throw new AppError('UPD-001', 'assets');
  const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]);
  // Kurulum türüne uygun dosya: Program Files altına MSI ile kurulduysa MSI, kullanıcı kurulumunda NSIS.
  const kind = await invoke<string>('install_kind').catch(() => 'nsis');
  const asset = kind === 'msi' && release.msi ? release.msi : release.installer;
  const off = await listen<{ downloaded: number; total: number }>('update-progress', (e) => {
    if (e.payload.total > 0) onProgress(e.payload.downloaded / e.payload.total);
  });
  try {
    const path = await invoke<string>('download_update', {
      url: asset.url,
      checksumsUrl: release.checksums.url,
      fileName: asset.name,
    });
    await invoke('install_update', { path });
  } catch (e) {
    throw new AppError('UPD-001', typeof e === 'string' ? e.slice(0, 80) : 'invoke');
  } finally {
    off();
  }
}

/** Web/PWA: service worker güncellemesini denetler. Yeni sürüm varsa üstte bildirim çıkar. */
export async function checkWebUpdate(): Promise<'checked' | 'unsupported'> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unsupported';
  try {
    await reg.update();
  } catch {
    throw new AppError('NET-001', 'sw-update');
  }
  return 'checked';
}
