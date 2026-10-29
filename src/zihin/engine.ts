import { AppError } from '../domain/errors';
import type { ZihinLocal } from './storage';

/**
 * Yerel dil modeli motoru (wllama: llama.cpp'nin WebAssembly derlemesi, MIT).
 * Model ve çalışma zamanı yalnızca kullanıcı Zihin'i etkinleştirdiğinde yüklenir; tüm hesaplama
 * cihazda, WebView'in kum havuzunda yapılır. Hiçbir metin dışarı gönderilmez.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  onToken?: (textSoFar: string) => void;
}

/** Testlerde sahte motorla değiştirilebilen sağlayıcı arayüzü. */
export interface ModelProvider {
  generate(messages: ChatMessage[], opts?: GenerateOptions): Promise<string>;
}

type WllamaT = import('@wllama/wllama').Wllama;

let instance: WllamaT | null = null;
let loadedName: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function isLoaded(): boolean {
  return Boolean(instance?.isModelLoaded());
}

export function loadedModelName(): string | null {
  return loadedName;
}

export async function loadEngine(local: ZihinLocal, opts: { contextLength?: number; onProgress?: (f: number) => void } = {}): Promise<void> {
  if (!local.runtimeUrl || !local.model) throw new AppError('ZHN-004', 'missing-files');
  if (instance?.isModelLoaded() && loadedName === local.model.name) return;
  await unloadEngine();
  const { Wllama } = await import('@wllama/wllama');
  const w = new Wllama({ default: local.runtimeUrl }, { suppressNativeLog: true, allowOffline: true });
  // Uyumluluk modu varsayılan olarak bir CDN'den dosya indirir; kapatılır (ağ erişimi yok).
  w.setCompat(null);
  opts.onProgress?.(0.1);
  const blob = await local.model.load();
  opts.onProgress?.(0.5);
  // Ekran kartı (WebGPU) varsa hesaplama oraya verilir; yoksa ya da başarısız olursa işlemciyle devam edilir.
  const base = { n_ctx: Math.min(opts.contextLength ?? 4096, 4096), n_threads: 1, reasoning: false };
  try {
    if (w.isSupportWebGPU()) {
      try {
        await w.loadModel([blob], { ...base, n_gpu_layers: 999 });
      } catch {
        await w.exit().catch(() => undefined);
        return loadEngineCpu(local, blob, base, opts);
      }
    } else {
      await w.loadModel([blob], base);
    }
    // Bozuk ya da uyumsuz dosyalar bazen hatasız "yüklenir"; temel model bilgileri denetlenir.
    const meta = w.getModelMetadata();
    if (!meta?.hparams || !(meta.hparams.nVocab > 0) || !(meta.hparams.nLayer > 0)) throw new Error('invalid-model');
  } catch (e) {
    await w.exit().catch(() => undefined);
    throw new AppError('ZHN-005', e instanceof Error ? e.message.slice(0, 60) : 'load');
  }
  opts.onProgress?.(1);
  instance = w;
  loadedName = local.model.name;
}

async function loadEngineCpu(local: ZihinLocal, blob: Blob, base: Record<string, unknown>, opts: { onProgress?: (f: number) => void }): Promise<void> {
  const { Wllama } = await import('@wllama/wllama');
  const w = new Wllama({ default: local.runtimeUrl! }, { suppressNativeLog: true, allowOffline: true });
  w.setCompat(null);
  try {
    await w.loadModel([blob], { ...base, n_gpu_layers: 0 });
    const meta = w.getModelMetadata();
    if (!meta?.hparams || !(meta.hparams.nVocab > 0) || !(meta.hparams.nLayer > 0)) throw new Error('invalid-model');
  } catch (e) {
    await w.exit().catch(() => undefined);
    throw new AppError('ZHN-005', e instanceof Error ? e.message.slice(0, 60) : 'load');
  }
  opts.onProgress?.(1);
  instance = w;
  loadedName = local.model!.name;
}

export async function unloadEngine(): Promise<void> {
  const w = instance;
  instance = null;
  loadedName = null;
  if (w) await w.exit().catch(() => undefined);
}

/** Wllama tabanlı sağlayıcı. Çağrılar sıraya alınır (motor aynı anda tek iş yapar). */
export const wllamaProvider: ModelProvider = {
  generate(messages, opts = {}) {
    const run = async () => {
      if (!instance?.isModelLoaded()) throw new AppError('ZHN-004', 'not-loaded');
      let text = '';
      try {
        const res = await instance.createChatCompletion({
          messages,
          max_tokens: opts.maxTokens ?? 512,
          temperature: opts.temperature ?? 0.3,
          abortSignal: opts.signal,
          ...(opts.jsonSchema ? { response_format: { type: 'json_schema' as const, json_schema: { name: 'cevap', schema: opts.jsonSchema } } } : {}),
          stream: true,
          onData: (chunk) => {
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              text += delta;
              opts.onToken?.(text);
            }
          },
        } as Parameters<WllamaT['createChatCompletion']>[0] & { stream: true; onData: (c: { choices?: { delta?: { content?: string } }[] }) => void });
        void res;
      } catch (e) {
        if (opts.signal?.aborted) throw new AppError('SRC-006', 'zihin-cancel');
        throw new AppError('ZHN-005', e instanceof Error ? e.message.slice(0, 60) : 'generate');
      }
      return text;
    };
    const p = queue.then(run, run);
    queue = p.catch(() => undefined);
    return p;
  },
};
