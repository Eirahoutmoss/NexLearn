/**
 * Öğrenme bilimi yardımcıları (saf fonksiyonlar): karıştırmalı sıra, güven kalibrasyonu,
 * Feynman karşılaştırması ve kavram bazında hatırlama gücü.
 */
import { normalizeForSearch } from './text';
import type { ConceptRelation, LearningItem, ReviewEvent, ReviewState } from './types';

/* ---------------- Karıştırmalı tekrar (interleaving) ---------------- */

export interface InterleaveEntry {
  id: string;
  /** Kartın "konu anahtarı": bağlı ilk kavram, yoksa kaynak, yoksa kendisi. */
  topic: string;
}

export function topicOf(item: Pick<LearningItem, 'id' | 'conceptIds' | 'sourceRefs'>): string {
  return item.conceptIds[0] ?? (item.sourceRefs[0] ? `src:${item.sourceRefs[0].sourceId}` : `item:${item.id}`);
}

/**
 * Aynı konudan kartların art arda gelmesini önleyecek şekilde sıralar (deterministik).
 * Karşıt (`contrasts_with`) kavramlar mümkünse yan yana getirilir: ayırt etmeyi güçlendirir.
 * Girdi sırası (vade sırası) her konunun kendi içinde korunur.
 */
export function interleave<T extends InterleaveEntry>(entries: T[], relations: Pick<ConceptRelation, 'fromConceptId' | 'toConceptId' | 'relationType'>[] = []): T[] {
  if (entries.length < 3) return [...entries];
  const queues = new Map<string, T[]>();
  const order: string[] = [];
  for (const e of entries) {
    if (!queues.has(e.topic)) {
      queues.set(e.topic, []);
      order.push(e.topic);
    }
    queues.get(e.topic)!.push(e);
  }
  const contrast = new Map<string, Set<string>>();
  for (const r of relations) {
    if (r.relationType !== 'contrasts_with') continue;
    if (!contrast.has(r.fromConceptId)) contrast.set(r.fromConceptId, new Set());
    if (!contrast.has(r.toConceptId)) contrast.set(r.toConceptId, new Set());
    contrast.get(r.fromConceptId)!.add(r.toConceptId);
    contrast.get(r.toConceptId)!.add(r.fromConceptId);
  }
  const out: T[] = [];
  let last: string | null = null;
  while (out.length < entries.length) {
    const available = order.filter((t) => queues.get(t)!.length > 0);
    // Öncelik: son konunun karşıtı → son konudan farklı ve en çok kartı kalan → herhangi biri.
    const contrastPick: string | undefined = last ? available.find((t) => t !== last && contrast.get(last!)?.has(t)) : undefined;
    const different = available.filter((t) => t !== last).sort((a, b) => queues.get(b)!.length - queues.get(a)!.length || order.indexOf(a) - order.indexOf(b));
    const topic: string = contrastPick ?? different[0] ?? available[0];
    out.push(queues.get(topic)!.shift()!);
    last = topic;
  }
  return out;
}

/* ---------------- Güven kalibrasyonu (üstbiliş) ---------------- */

export interface CalibrationRow {
  confidence: 1 | 2 | 3;
  attempts: number;
  correct: number;
  percent: number | null;
}

export interface Calibration {
  rows: CalibrationRow[];
  /** Emin olunup yanlış hatırlanan tekrarların kart kimlikleri (en yeniden eskiye, tekil). */
  confidentlyWrong: string[];
  /** Emin olunmayıp doğru hatırlanan tekrar sayısı (kendini küçümseme). */
  underconfident: number;
  answered: number;
}

export function calibration(events: Pick<ReviewEvent, 'learningItemId' | 'rating' | 'confidence' | 'reviewedAt'>[]): Calibration {
  const rows: CalibrationRow[] = ([1, 2, 3] as const).map((c) => {
    const ev = events.filter((e) => e.confidence === c);
    const correct = ev.filter((e) => e.rating >= 3).length;
    return { confidence: c, attempts: ev.length, correct, percent: ev.length ? Math.round((correct / ev.length) * 100) : null };
  });
  const sorted = [...events].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
  const confidentlyWrong = [...new Set(sorted.filter((e) => e.confidence === 3 && e.rating < 3).map((e) => e.learningItemId))];
  return {
    rows,
    confidentlyWrong,
    underconfident: events.filter((e) => e.confidence === 1 && e.rating >= 3).length,
    answered: events.filter((e) => e.confidence != null).length,
  };
}

/* ---------------- Feynman karşılaştırması ---------------- */

export interface FeynmanResult {
  /** Kaynaktaki önemli terimlerden açıklamada geçenler. */
  covered: string[];
  /** Kaynaktaki önemli terimlerden açıklamada hiç geçmeyenler. */
  missing: string[];
  /** Ortalama cümle uzunluğu (kelime). Sadelik göstergesi; 20'nin üstü uzun sayılır. */
  avgSentenceWords: number;
  /** Uzun (13+ harf) kelime oranı (%). */
  longWordRatio: number;
  wordCount: number;
}

/** Türkçe ekleri kabaca yok sayan eşleşme: terimin ilk 5 harfi (ya da tamamı) metindeki bir kelimenin başında geçiyor mu? */
function containsTerm(normWords: string[], term: string): boolean {
  const t = normalizeForSearch(term);
  const parts = t.split(' ').filter(Boolean);
  return parts.every((p) => {
    const stem = p.length > 6 ? p.slice(0, Math.max(5, p.length - 3)) : p;
    return normWords.some((w) => w.startsWith(stem));
  });
}

export function feynmanCheck(explanation: string, keyTerms: string[]): FeynmanResult {
  const norm = normalizeForSearch(explanation);
  const words = norm.match(/[\p{L}\p{N}]+/gu) ?? [];
  const sentences = explanation.split(/[.!?…]+\s*/).filter((s) => s.trim().length > 0);
  const covered: string[] = [];
  const missing: string[] = [];
  for (const term of keyTerms) (containsTerm(words, term) ? covered : missing).push(term);
  const longWords = words.filter((w) => w.length >= 13).length;
  return {
    covered,
    missing,
    avgSentenceWords: sentences.length ? Math.round((words.length / sentences.length) * 10) / 10 : 0,
    longWordRatio: words.length ? Math.round((longWords / words.length) * 100) : 0,
    wordCount: words.length,
  };
}

/* ---------------- Kavram bazında hatırlama gücü (unutma haritası) ---------------- */

export type Strength = 'strong' | 'fading' | 'forgotten' | 'new' | 'none';

const DAY = 86_400_000;

/**
 * Bir kavrama bağlı kartların durumuna göre hatırlama gücü:
 * - none: bağlı kart yok
 * - new: kartlar hiç tekrar edilmemiş
 * - forgotten: kartların yarısından fazlası 3+ gün gecikmiş ya da son tekrarı unutulmuş
 * - fading: en az bir kart vadesi geçmiş
 * - strong: tüm tekrar edilmiş kartlar vadesinde
 */
export function conceptStrength(
  conceptId: string,
  items: Pick<LearningItem, 'id' | 'conceptIds' | 'suspended'>[],
  states: Map<string, Pick<ReviewState, 'dueAt' | 'lastReviewedAt' | 'repetitionCount'>>,
  lastRatings: Map<string, number>,
  now: Date = new Date(),
): Strength {
  const linked = items.filter((i) => !i.suspended && i.conceptIds.includes(conceptId));
  if (!linked.length) return 'none';
  const reviewed = linked.filter((i) => states.get(i.id)?.lastReviewedAt);
  if (!reviewed.length) return 'new';
  let overdue = 0;
  let badly = 0;
  for (const i of reviewed) {
    const s = states.get(i.id)!;
    const late = now.getTime() - new Date(s.dueAt).getTime();
    if (late > 0) overdue++;
    if (late > 3 * DAY || (lastRatings.get(i.id) ?? 5) < 3) badly++;
  }
  if (badly / reviewed.length > 0.5) return 'forgotten';
  if (overdue > 0) return 'fading';
  return 'strong';
}
