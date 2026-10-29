import { AppError } from '../domain/errors';
import { isTauri } from './update';

/**
 * NexAktar istemcisi (masaüstü). Sunucu Rust tarafında; bu modül yalnızca komutları çağırır.
 * Protokol: docs/NEXAKTAR.md
 */
export interface AktarIncoming {
  id: string;
  name: string;
  size: number;
  mime: string;
}
export interface AktarOutgoing {
  id: string;
  name: string;
  size: number;
}
export interface AktarSession {
  url: string;
  host: string;
  port: number;
  qrSvg: string;
  remainingSecs: number;
  outgoing: AktarOutgoing[];
}

export function aktarSupported(): boolean {
  return isTauri();
}

async function core() {
  if (!isTauri()) throw new AppError('AKT-001', 'not-desktop');
  return import('@tauri-apps/api/core');
}

function wrap(e: unknown): never {
  const reason = typeof e === 'string' ? e.slice(0, 40) : 'invoke';
  throw new AppError(reason === 'no-lan' ? 'AKT-002' : 'AKT-001', reason);
}

export async function startAktar(): Promise<AktarSession> {
  const { invoke } = await core();
  return invoke<AktarSession>('aktar_start').catch(wrap);
}
export async function aktarStatus(): Promise<AktarSession | null> {
  const { invoke } = await core();
  return invoke<AktarSession | null>('aktar_status').catch(wrap);
}
export async function extendAktar(): Promise<number> {
  const { invoke } = await core();
  return invoke<number>('aktar_extend').catch(wrap);
}
export async function stopAktar(): Promise<void> {
  const { invoke } = await core();
  await invoke('aktar_stop').catch(wrap);
}
export async function pendingAktar(): Promise<AktarIncoming[]> {
  const { invoke } = await core();
  return invoke<AktarIncoming[]>('aktar_pending').catch(wrap);
}
/** Onaylanan dosyayı File olarak alır (bekleme klasöründen silinir). */
export async function takeAktar(item: AktarIncoming): Promise<File> {
  const { invoke } = await core();
  const buf = await invoke<ArrayBuffer>('aktar_take', { id: item.id }).catch(wrap);
  return new File([buf], item.name, { type: item.mime });
}
export async function rejectAktar(id: string): Promise<void> {
  const { invoke } = await core();
  await invoke('aktar_reject', { id }).catch(wrap);
}
export async function offerAktar(name: string, bytes: Uint8Array): Promise<AktarOutgoing[]> {
  const { invoke } = await core();
  return invoke<AktarOutgoing[]>('aktar_offer', bytes, { headers: { 'x-name': encodeURIComponent(name) } }).catch(wrap);
}
export async function unofferAktar(id: string): Promise<AktarOutgoing[]> {
  const { invoke } = await core();
  return invoke<AktarOutgoing[]>('aktar_unoffer', { id }).catch(wrap);
}
export async function onAktarEvents(handlers: { incoming: (i: AktarIncoming) => void; stopped: (reason: string) => void }): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  const a = await listen<AktarIncoming>('aktar-incoming', (e) => handlers.incoming(e.payload));
  const b = await listen<string>('aktar-stopped', (e) => handlers.stopped(e.payload));
  return () => {
    a();
    b();
  };
}

export function qrDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
