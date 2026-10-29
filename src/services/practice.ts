import type { LearningItem, ReviewState } from '../domain/types';
import { recordSession } from './reading';

/**
 * Sınav provası: tekrar planını DEĞİŞTİRMEYEN, karışık sorulu kendi kendini sınama.
 * Sonuçlar yalnızca "practice" oturumu olarak kaydedilir; hatırlama metriklerine karışmaz.
 */

export type PracticeScope =
  | { kind: 'all' }
  | { kind: 'source'; sourceId: string }
  | { kind: 'concept'; conceptId: string }
  | { kind: 'hard' }
  | { kind: 'tag'; tag: string };

export type PracticeGrade = 'knew' | 'partial' | 'missed';

/** Basit tohumlu rastgele sayı üreteci (mulberry32): testlerde deterministik karıştırma için. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildPracticeSet(
  items: LearningItem[],
  states: Map<string, ReviewState>,
  scope: PracticeScope,
  count: number,
  rand: () => number = Math.random,
): LearningItem[] {
  const pool = items.filter((i) => {
    if (i.deletedAt) return false;
    switch (scope.kind) {
      case 'all':
        return true;
      case 'source':
        return i.sourceRefs.some((r) => r.sourceId === scope.sourceId);
      case 'concept':
        return i.conceptIds.includes(scope.conceptId);
      case 'tag':
        return i.tags.includes(scope.tag);
      case 'hard': {
        const s = states.get(i.id);
        return Boolean(s && s.repetitionCount + s.lapseCount > 0 && (s.lapseCount >= 2 || s.easeFactor <= 1.7));
      }
    }
  });
  // Fisher–Yates
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.max(1, count));
}

export interface PracticeSummary {
  total: number;
  knew: number;
  partial: number;
  missed: number;
  /** Bilgi/kısmi ağırlıklı puan (0-100): bildim=1, kısmen=0.5. */
  score: number;
}

export function summarizePractice(grades: PracticeGrade[]): PracticeSummary {
  const knew = grades.filter((g) => g === 'knew').length;
  const partial = grades.filter((g) => g === 'partial').length;
  const missed = grades.filter((g) => g === 'missed').length;
  return { total: grades.length, knew, partial, missed, score: grades.length ? Math.round(((knew + partial * 0.5) / grades.length) * 100) : 0 };
}

export async function savePracticeSession(startedAt: Date, activeMs: number, summary: PracticeSummary, sourceIds: string[]): Promise<void> {
  // Kısa denemeler de kayda değer: sınav provasında süre değil sonuç önemlidir.
  await recordSession('practice', startedAt, new Date(), Math.max(activeMs, 5000), sourceIds, {
    total: summary.total,
    knew: summary.knew,
    partial: summary.partial,
    missed: summary.missed,
    score: summary.score,
  });
}
