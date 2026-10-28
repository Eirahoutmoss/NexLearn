import { describe, expect, it } from 'vitest';
import { forceLayout, nearestInDirection } from './layout';
import { splitPieces } from '../read/readerUtils';
import type { Annotation } from '../../domain/types';

describe('bilgi haritası yerleşimi', () => {
  it('deterministik ve sınırlar içinde', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    const p1 = forceLayout(nodes, edges);
    const p2 = forceLayout(nodes, edges);
    expect([...p1.entries()]).toEqual([...p2.entries()]);
    for (const { x, y } of p1.values()) {
      expect(x).toBeGreaterThanOrEqual(60);
      expect(y).toBeLessThanOrEqual(760);
    }
  });
  it('sabit düğüm yerinde kalır', () => {
    const p = forceLayout([{ id: 'a', x: 100, y: 100, fixed: true }, { id: 'b' }], [{ from: 'a', to: 'b' }]);
    expect(p.get('a')).toEqual({ x: 100, y: 100 });
  });
  it('performans bütçesi: 200 düğüm < 1 sn', () => {
    const nodes = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}` }));
    const edges = Array.from({ length: 300 }, (_, i) => ({ from: `n${i % 200}`, to: `n${(i * 7 + 3) % 200}` }));
    const t0 = performance.now();
    forceLayout(nodes, edges);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it('yöne göre en yakın düğüm', () => {
    const c = [{ id: 'r', x: 200, y: 100 }, { id: 'l', x: 0, y: 100 }, { id: 'd', x: 100, y: 300 }];
    expect(nearestInDirection({ x: 100, y: 100 }, c, 'right')).toBe('r');
    expect(nearestInDirection({ x: 100, y: 100 }, c, 'down')).toBe('d');
    expect(nearestInDirection({ x: 100, y: 100 }, c, 'up')).toBeUndefined();
  });
});

describe('vurgu parçalama', () => {
  const ann = (id: string, s: number, e: number, createdAt: string) => ({ id, startInSegment: s, endInSegment: e, createdAt }) as Annotation;
  it('çakışan vurgularda en yenisi üstte, metin korunur', () => {
    const text = 'abcdefghij';
    const pieces = splitPieces(text, [ann('1', 0, 6, '2026-01-01'), ann('2', 4, 8, '2026-01-02')]);
    expect(pieces.map((p) => p.text).join('')).toBe(text);
    expect(pieces.map((p) => [p.text, p.annotation?.id])).toEqual([['abcd', '1'], ['efgh', '2'], ['ij', undefined]]);
  });
  it('taşan aralık kırpılır', () => {
    const pieces = splitPieces('abc', [ann('1', 1, 99, 'x')]);
    expect(pieces.map((p) => p.text)).toEqual(['a', 'bc']);
  });
});
