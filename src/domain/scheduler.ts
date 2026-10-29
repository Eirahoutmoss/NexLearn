import type { ReviewButton, ScheduleSnapshot } from './types';

/**
 * SM-2 türevi deterministik tekrar algoritması (bkz. docs/DATA_MODEL.md).
 * Saf fonksiyon: (durum, puan, şimdi, yapılandırma) => yeni durum. Yan etkisi yoktur, saat dilimi etkisi yoktur.
 */

export const ALGORITHM_VERSION = 'sm2-v1';

export interface SchedulerConfig {
  minEase: number;
  initialEase: number;
  easyBonus: number;
  maxIntervalDays: number;
}

export const DEFAULT_SCHEDULER_CONFIG: Readonly<SchedulerConfig> = Object.freeze({
  minEase: 1.3,
  initialEase: 2.5,
  easyBonus: 1.3,
  maxIntervalDays: 3650,
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Arayüzdeki 4 düğmenin SM-2 puanı (0-5) karşılığı. */
export const BUTTON_RATING: Readonly<Record<ReviewButton, number>> = Object.freeze({
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
});

export function initialSchedule(now: Date, config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG): ScheduleSnapshot {
  return {
    repetitionCount: 0,
    intervalDays: 0,
    easeFactor: config.initialEase,
    lapseCount: 0,
    dueAt: now.toISOString(),
    lastReviewedAt: null,
  };
}

/** Kayan nokta gürültüsünü önlemek için kolaylık katsayısını 4 ondalığa yuvarlar. */
function roundEase(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function schedule(
  state: ScheduleSnapshot,
  rating: number,
  now: Date,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
): ScheduleSnapshot {
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
    throw new RangeError(`Geçersiz puan: ${rating}`);
  }
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('Geçersiz tarih');
  }

  let { repetitionCount, intervalDays, easeFactor, lapseCount } = state;

  if (rating < 3) {
    repetitionCount = 0;
    intervalDays = 1;
    lapseCount += 1;
    easeFactor = roundEase(Math.max(config.minEase, easeFactor - 0.2));
  } else {
    const q = 5 - rating;
    easeFactor = roundEase(Math.max(config.minEase, easeFactor + (0.1 - q * (0.08 + q * 0.02))));
    repetitionCount += 1;
    if (repetitionCount === 1) {
      intervalDays = 1;
    } else if (repetitionCount === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    if (rating === 5) {
      intervalDays = Math.round(intervalDays * config.easyBonus);
    }
  }

  intervalDays = Math.max(1, Math.min(intervalDays, config.maxIntervalDays));

  return {
    repetitionCount,
    intervalDays,
    easeFactor,
    lapseCount,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

export type ScheduleReason =
  | { key: 'firstSuccess'; days: number }
  | { key: 'secondSuccess'; days: number }
  | { key: 'streakSuccess'; days: number; count: number }
  | { key: 'easyBonus'; days: number }
  | { key: 'forgotten'; days: number }
  | { key: 'hard'; days: number };

/** Planlama sonrası kullanıcıya gösterilecek kısa gerekçe (açıklanabilirlik ilkesi). */
export function explainSchedule(before: ScheduleSnapshot, after: ScheduleSnapshot, rating: number): ScheduleReason {
  const days = after.intervalDays;
  if (rating < 3) return { key: 'forgotten', days };
  if (rating === 5 && after.repetitionCount > 0) return { key: 'easyBonus', days };
  if (rating === 3 && after.easeFactor < before.easeFactor) {
    if (after.repetitionCount > 2) return { key: 'hard', days };
  }
  if (after.repetitionCount === 1) return { key: 'firstSuccess', days };
  if (after.repetitionCount === 2) return { key: 'secondSuccess', days };
  return { key: 'streakSuccess', days, count: after.repetitionCount };
}

/** Kart, verilen anın (genellikle yerel günün sonu) öncesinde vadesi gelmişse true. */
export function isDue(dueAt: string, reference: Date): boolean {
  return new Date(dueAt).getTime() <= reference.getTime();
}

/** Yerel günün sonu (23:59:59.999). Kuyruk "bugün" sınırı için kullanılır. */
export function endOfLocalDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}
