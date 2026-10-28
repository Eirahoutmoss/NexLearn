/** Önekli benzersiz kimlik üretir (ör. src_9f3c...). crypto.randomUUID tüm hedef platformlarda mevcuttur. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}
