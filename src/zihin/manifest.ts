import { AppError } from '../domain/errors';

/**
 * Zihin paketi manifesti. Geliştiricinin kendi GitHub sürümünde (etiket `zihin-v1`) yayımlanır.
 * Biçim: docs/ZIHIN.md. Üretmek için: scripts/make-zihin-manifest.mjs
 */
export const ZIHIN_RELEASE_TAG = 'zihin-v1';
export const ZIHIN_MANIFEST_URL = `https://github.com/Eirahoutmoss/NexLearn/releases/download/${ZIHIN_RELEASE_TAG}/zihin-manifest.json`;
const PREFIX = 'https://github.com/Eirahoutmoss/NexLearn/releases/download/';

export interface ZihinFileRef {
  name: string;
  url: string;
  size: number;
  sha256: string;
}

export interface ZihinModel extends ZihinFileRef {
  id: string;
  label: string;
  license: string;
  contextLength: number;
  languages: string[];
  /** Hafif / dengeli / güçlü — arayüzdeki açıklama ve cihaza göre öneri bu kademeye göre yapılır. */
  tier: ZihinTier;
  /** Rahat çalışması için önerilen en az bellek (GB). */
  minRamGB: number;
}

export type ZihinTier = 'light' | 'balanced' | 'strong';

export interface ZihinManifest {
  format: 'nexlearn-zihin';
  formatVersion: 1;
  runtime: ZihinFileRef & { engine: 'wllama'; version: string };
  models: ZihinModel[];
}

const FILE_RE = /^[A-Za-z0-9._-]{1,160}$/;

function fileRef(raw: unknown, ext: RegExp, where: string): ZihinFileRef {
  const r = raw as Record<string, unknown>;
  if (!r || typeof r !== 'object') throw new AppError('ZHN-001', where);
  const { name, url, size, sha256 } = r;
  if (typeof name !== 'string' || !FILE_RE.test(name) || name.includes('..') || !ext.test(name)) throw new AppError('ZHN-001', `${where}.name`);
  if (typeof url !== 'string' || !url.startsWith(PREFIX) || !url.endsWith(`/${name}`)) throw new AppError('ZHN-001', `${where}.url`);
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0 || size > 3 * 1024 ** 3) throw new AppError('ZHN-001', `${where}.size`);
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sha256)) throw new AppError('ZHN-001', `${where}.sha256`);
  return { name, url, size, sha256: sha256.toLowerCase() };
}

export function parseManifest(text: string): ZihinManifest {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new AppError('ZHN-001', 'json');
  }
  if (raw?.format !== 'nexlearn-zihin') throw new AppError('ZHN-001', 'format');
  if (raw.formatVersion !== 1) throw new AppError('ZHN-001', 'version');
  const rt = raw.runtime as Record<string, unknown>;
  const runtime = { ...fileRef(rt, /\.wasm$/i, 'runtime'), engine: 'wllama' as const, version: typeof rt?.version === 'string' ? rt.version.slice(0, 32) : '' };
  if (rt?.engine !== 'wllama') throw new AppError('ZHN-001', 'engine');
  if (!Array.isArray(raw.models) || raw.models.length === 0 || raw.models.length > 10) throw new AppError('ZHN-001', 'models');
  const models = (raw.models as Record<string, unknown>[]).map((m, i): ZihinModel => {
    const ref = fileRef(m, /\.gguf$/i, `models[${i}]`);
    const id = typeof m.id === 'string' && /^[a-z0-9-]{1,40}$/.test(m.id) ? m.id : null;
    if (!id) throw new AppError('ZHN-001', `models[${i}].id`);
    return {
      ...ref,
      id,
      label: typeof m.label === 'string' ? m.label.slice(0, 80) : id,
      license: typeof m.license === 'string' ? m.license.slice(0, 60) : '',
      contextLength: typeof m.contextLength === 'number' && m.contextLength >= 512 ? Math.min(m.contextLength, 32768) : 2048,
      languages: Array.isArray(m.languages) ? (m.languages as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
      tier: (m.tier === 'light' || m.tier === 'balanced' || m.tier === 'strong' ? m.tier : ref.size < 700 * 1024 ** 2 ? 'light' : ref.size < 1500 * 1024 ** 2 ? 'balanced' : 'strong') as ZihinTier,
      minRamGB: typeof m.minRamGB === 'number' && m.minRamGB > 0 && m.minRamGB <= 64 ? m.minRamGB : Math.ceil((ref.size * 2.2) / 1024 ** 3),
    };
  });
  return { format: 'nexlearn-zihin', formatVersion: 1, runtime, models };
}
