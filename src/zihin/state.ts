import { useSyncExternalStore } from 'react';
import { loadEngine, unloadEngine, isLoaded } from './engine';
import { localStatus, type ZihinLocal } from './storage';
import type { ZihinModel } from './manifest';

/** Zihin'in uygulama genelindeki durumu (motor tek örnek olduğu için modül düzeyinde). */
export type ZihinPhase = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

interface State {
  phase: ZihinPhase;
  progress: number;
  modelName: string | null;
  errorCode: string | null;
}

let state: State = { phase: 'idle', progress: 0, modelName: null, errorCode: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function useZihinState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

let starting: Promise<void> | null = null;

/** Motoru ve modeli belleğe yükler. Aynı anda gelen çağrılar tek yüklemeyi bekler. */
export function startZihin(local?: ZihinLocal): Promise<void> {
  if (isLoaded()) return Promise.resolve();
  if (starting) return starting;
  starting = (async () => {
    set({ phase: 'loading', progress: 0, errorCode: null });
    try {
      const l = local ?? (await localStatus());
      await loadEngine(l, { onProgress: (p) => set({ progress: p }) });
      set({ phase: 'ready', progress: 1, modelName: l.model?.name ?? null });
    } catch (e) {
      set({ phase: 'error', errorCode: (e as { code?: string }).code ?? 'ZHN-005' });
      throw e;
    } finally {
      starting = null;
    }
  })();
  return starting;
}

export async function stopZihin(): Promise<void> {
  await unloadEngine();
  set({ phase: 'idle', progress: 0, modelName: null, errorCode: null });
}

/**
 * Tek adımda etkinleştirme: önerilen modeli (ya da verileni) indirir, SHA-256 ile doğrular ve başlatır.
 * Model zaten cihazdaysa indirme atlanır.
 */
export async function activateZihin(model?: ZihinModel): Promise<void> {
  const s = await import('./storage');
  set({ phase: 'downloading', progress: 0, errorCode: null });
  try {
    const target = model ?? (await s.fetchManifest()).models[0];
    const current = await s.localStatus();
    if (current.model?.name !== target.name) {
      await unloadEngine();
      await s.removeLocal();
      await s.downloadFile(target, (f) => set({ progress: f }));
    }
  } catch (e) {
    set({ phase: 'error', errorCode: (e as { code?: string }).code ?? 'ZHN-003' });
    throw e;
  }
  await startZihin();
}
