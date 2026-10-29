import { describe, expect, it } from 'vitest';
import { calibration, conceptStrength, feynmanCheck, interleave } from './learning';

describe('karıştırmalı sıra', () => {
  it('aynı konu art arda gelmez, konu içi sıra korunur', () => {
    const e = [
      { id: 'a1', topic: 'A' }, { id: 'a2', topic: 'A' }, { id: 'a3', topic: 'A' },
      { id: 'b1', topic: 'B' }, { id: 'b2', topic: 'B' }, { id: 'c1', topic: 'C' },
    ];
    const out = interleave(e);
    expect(out).toHaveLength(6);
    for (let i = 1; i < out.length; i++) expect(out[i].topic).not.toBe(out[i - 1].topic);
    const aOrder = out.filter((x) => x.topic === 'A').map((x) => x.id);
    expect(aOrder).toEqual(['a1', 'a2', 'a3']);
    expect(interleave(e)).toEqual(out);
  });
  it('karşıt kavramları yan yana getirir', () => {
    const e = [{ id: '1', topic: 'TCP' }, { id: '2', topic: 'IP' }, { id: '3', topic: 'UDP' }, { id: '4', topic: 'IP' }];
    const out = interleave(e, [{ fromConceptId: 'TCP', toConceptId: 'UDP', relationType: 'contrasts_with' }]);
    expect(out[0].topic).toBe('IP');
    const iT = out.findIndex((x) => x.topic === 'TCP');
    const iU = out.findIndex((x) => x.topic === 'UDP');
    expect(Math.abs(iT - iU)).toBe(1);
  });
});

describe('güven kalibrasyonu', () => {
  it('emin olunup yanılınan kartları ve oranları bulur', () => {
    const ev = [
      { learningItemId: 'x', rating: 1, confidence: 3 as const, reviewedAt: '2026-01-02' },
      { learningItemId: 'y', rating: 4, confidence: 3 as const, reviewedAt: '2026-01-01' },
      { learningItemId: 'z', rating: 4, confidence: 1 as const, reviewedAt: '2026-01-01' },
      { learningItemId: 'w', rating: 4, reviewedAt: '2026-01-01' },
    ];
    const c = calibration(ev);
    expect(c.rows[2]).toEqual({ confidence: 3, attempts: 2, correct: 1, percent: 50 });
    expect(c.rows[1].percent).toBeNull();
    expect(c.confidentlyWrong).toEqual(['x']);
    expect(c.underconfident).toBe(1);
    expect(c.answered).toBe(3);
  });
});

describe('Feynman karşılaştırması', () => {
  it('Türkçe eklere rağmen terimi bulur, eksik terimleri listeler', () => {
    const r = feynmanCheck('TCP bağlantısı kurulurken üç yönlü el sıkışması yapılır. Paketler sırayla gelir.', ['TCP', 'el sıkışma', 'paket', 'yönlendirici']);
    expect(r.covered).toEqual(['TCP', 'el sıkışma', 'paket']);
    expect(r.missing).toEqual(['yönlendirici']);
    expect(r.avgSentenceWords).toBeGreaterThan(3);
  });
});

describe('kavram hatırlama gücü', () => {
  const now = new Date('2026-03-10T12:00:00Z');
  const items = [{ id: 'a', conceptIds: ['c'], suspended: false }, { id: 'b', conceptIds: ['c'], suspended: false }];
  it('durumları ayırır', () => {
    expect(conceptStrength('k', items, new Map(), new Map(), now)).toBe('none');
    expect(conceptStrength('c', items, new Map([['a', { dueAt: now.toISOString(), lastReviewedAt: null, repetitionCount: 0 }]]), new Map(), now)).toBe('new');
    const future = new Date(now.getTime() + 86_400_000).toISOString();
    const past1 = new Date(now.getTime() - 3_600_000).toISOString();
    const past5 = new Date(now.getTime() - 5 * 86_400_000).toISOString();
    const st = (dueAt: string) => ({ dueAt, lastReviewedAt: '2026-03-01', repetitionCount: 2 });
    expect(conceptStrength('c', items, new Map([['a', st(future)], ['b', st(future)]]), new Map(), now)).toBe('strong');
    expect(conceptStrength('c', items, new Map([['a', st(past1)], ['b', st(future)]]), new Map(), now)).toBe('fading');
    expect(conceptStrength('c', items, new Map([['a', st(past5)], ['b', st(past5)]]), new Map(), now)).toBe('forgotten');
    expect(conceptStrength('c', items, new Map([['a', st(future)], ['b', st(future)]]), new Map([['a', 1], ['b', 1]]), now)).toBe('forgotten');
  });
});
