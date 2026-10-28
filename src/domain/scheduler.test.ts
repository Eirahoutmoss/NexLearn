import { describe, expect, it } from 'vitest';
import { BUTTON_RATING, DEFAULT_SCHEDULER_CONFIG, endOfLocalDay, explainSchedule, initialSchedule, schedule } from './scheduler';

const T0 = new Date('2026-01-01T09:00:00.000Z');
const DAY = 86_400_000;

describe('SM-2 zamanlayıcı (Ek A)', () => {
  it('ilk başarılı tekrar → 1 gün', () => {
    const s = schedule(initialSchedule(T0), 4, T0);
    expect(s.repetitionCount).toBe(1);
    expect(s.intervalDays).toBe(1);
    expect(s.dueAt).toBe(new Date(T0.getTime() + DAY).toISOString());
    expect(s.lastReviewedAt).toBe(T0.toISOString());
  });

  it('ikinci başarılı → 6 gün, üçüncü → round(6 × ease)', () => {
    let s = schedule(initialSchedule(T0), 4, T0);
    s = schedule(s, 4, new Date(s.dueAt));
    expect(s.intervalDays).toBe(6);
    s = schedule(s, 4, new Date(s.dueAt));
    expect(s.intervalDays).toBe(Math.round(6 * 2.5));
    expect(s.easeFactor).toBe(2.5);
  });

  it('başarısız → 1 gün, tekrar sayısı sıfırlanır, ease −0.2, lapse +1', () => {
    let s = schedule(initialSchedule(T0), 4, T0);
    s = schedule(s, 4, new Date(s.dueAt));
    const f = schedule(s, 1, new Date(s.dueAt));
    expect(f.repetitionCount).toBe(0);
    expect(f.intervalDays).toBe(1);
    expect(f.lapseCount).toBe(1);
    expect(f.easeFactor).toBeCloseTo(s.easeFactor - 0.2, 6);
  });

  it('ease alt sınırı 1.3 korunur', () => {
    let s = initialSchedule(T0);
    for (let i = 0; i < 20; i++) s = schedule(s, 0, T0);
    expect(s.easeFactor).toBe(1.3);
    for (let i = 0; i < 20; i++) s = schedule(s, 3, T0);
    expect(s.easeFactor).toBe(1.3);
  });

  it('5 puan aralığı uzatır ama maxIntervalDays ile sınırlanır', () => {
    let s = initialSchedule(T0);
    for (let i = 0; i < 30; i++) s = schedule(s, 5, T0);
    expect(s.intervalDays).toBe(DEFAULT_SCHEDULER_CONFIG.maxIntervalDays);
    const first = schedule(initialSchedule(T0), 5, T0);
    expect(first.intervalDays).toBe(Math.round(1 * 1.3));
  });

  it('deterministik: aynı girdi → aynı çıktı', () => {
    const a = schedule(initialSchedule(T0), 3, T0);
    const b = schedule(initialSchedule(T0), 3, T0);
    expect(a).toEqual(b);
  });

  it('geçersiz puan reddedilir', () => {
    expect(() => schedule(initialSchedule(T0), 6, T0)).toThrow(RangeError);
    expect(() => schedule(initialSchedule(T0), 2.5, T0)).toThrow(RangeError);
  });

  it('UTC: saat dilimi sonucu etkilemez (vade tam gün katı)', () => {
    const s = schedule(initialSchedule(T0), 4, T0);
    expect(new Date(s.dueAt).getTime() - T0.getTime()).toBe(DAY);
  });

  it('düğme eşlemesi belgelenen puanlara karşılık gelir', () => {
    expect(BUTTON_RATING).toEqual({ again: 1, hard: 3, good: 4, easy: 5 });
  });

  it('gerekçe üretir', () => {
    const before = initialSchedule(T0);
    const after = schedule(before, 4, T0);
    expect(explainSchedule(before, after, 4)).toEqual({ key: 'firstSuccess', days: 1 });
    const failed = schedule(after, 1, T0);
    expect(explainSchedule(after, failed, 1).key).toBe('forgotten');
  });

  it('yerel gün sonu', () => {
    const e = endOfLocalDay(new Date(2026, 0, 5, 10, 0));
    expect(e.getHours()).toBe(23);
    expect(e.getDate()).toBe(5);
  });
});
