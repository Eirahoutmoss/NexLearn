import { useSyncExternalStore } from 'react';
import { loadEngine, unloadEngine, isLoaded } from './engine';
import { localStatus, type ZihinLocal } from './storage';

/** Zihin'in uygulama genelindeki durumu (motor tek örnek olduğu için modül düzeyinde). */
export type ZihinPhase = 'idle' | 'loading' | 'ready' | 'error';

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

export async function startZihin(local?: ZihinLocal): Promise<void> {
  if (isLoaded()) return;
  set({ phase: 'loading', progress: 0, errorCode: null });
  try {
    const l = local ?? (await localStatus());
    await loadEngine(l, { onProgress: (p) => set({ progress: p }) });
    set({ phase: 'ready', progress: 1, modelName: l.model?.name ?? null });
  } catch (e) {
    set({ phase: 'error', errorCode: (e as { code?: string }).code ?? 'ZHN-005' });
    throw e;
  }
}

export async function stopZihin(): Promise<void> {
  await unloadEngine();
  set({ phase: 'idle', progress: 0, modelName: null, errorCode: null });
}
