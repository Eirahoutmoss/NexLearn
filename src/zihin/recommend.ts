import type { ZihinModel } from './manifest';

/** Cihazın kaba profili (tarayıcının izin verdiği ölçüde; kişisel veri değildir ve hiçbir yere gönderilmez). */
export interface DeviceProfile {
  /** GB; Chromium en çok 8 bildirir. Bilinmiyorsa null. */
  memoryGB: number | null;
  cores: number;
  webgpu: boolean;
}

export function deviceProfile(): DeviceProfile {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  return {
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: nav.hardwareConcurrency || 2,
    webgpu: Boolean(nav.gpu),
  };
}

export type Fit = 'good' | 'heavy';

/** Model bu cihazda rahat çalışır mı? Bellek bilinmiyorsa 4 GB varsayılır (temkinli). */
export function fitOf(model: ZihinModel, p: DeviceProfile): Fit {
  const mem = p.memoryGB ?? 4;
  // deviceMemory 8'de tavan yapar: 8 bildiren cihaz genellikle daha fazlasına sahiptir.
  const effective = mem >= 8 ? 12 : mem;
  if (effective < model.minRamGB) return 'heavy';
  // Güçlü modeller ekran kartı (WebGPU) olmadan işlemcide çok yavaş kalır.
  if (model.tier === 'strong' && !p.webgpu) return 'heavy';
  return 'good';
}

/**
 * Önerilen model: cihaza uyan en yüksek kademe. Ekran kartı yoksa ve çekirdek sayısı azsa dengeli yerine hafif.
 * Hiçbiri uymuyorsa en küçük model.
 */
export function recommend(models: ZihinModel[], p: DeviceProfile): ZihinModel {
  const order = { light: 0, balanced: 1, strong: 2 } as const;
  const sorted = [...models].sort((a, b) => order[a.tier] - order[b.tier] || a.size - b.size);
  const fitting = sorted.filter((m) => fitOf(m, p) === 'good' && !(m.tier === 'balanced' && !p.webgpu && p.cores < 4));
  return fitting.at(-1) ?? sorted[0];
}
