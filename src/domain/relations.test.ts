import { describe, expect, it } from 'vitest';
import { validateRelation, wouldCreateCycle } from './relations';

const r = (id: string, from: string, to: string, type: 'prerequisite_of' | 'related_to' | 'part_of' = 'prerequisite_of') => ({
  id, fromConceptId: from, toConceptId: to, relationType: type, deletedAt: null,
});

describe('ilişki kuralları', () => {
  it('kendine ilişkiyi reddeder', () => {
    expect(() => validateRelation([], { fromConceptId: 'a', toConceptId: 'a', relationType: 'supports' })).toThrow(/REL-001/);
  });
  it('yinelenen ilişkiyi reddeder; yönsüz türde ters yön de yinelemedir', () => {
    expect(() => validateRelation([r('1', 'a', 'b')], { fromConceptId: 'a', toConceptId: 'b', relationType: 'prerequisite_of' })).toThrow(/REL-003/);
    expect(() => validateRelation([r('1', 'a', 'b', 'related_to')], { fromConceptId: 'b', toConceptId: 'a', relationType: 'related_to' })).toThrow(/REL-003/);
  });
  it('ön koşul döngüsünü reddeder', () => {
    const edges = [r('1', 'a', 'b'), r('2', 'b', 'c')];
    expect(() => validateRelation(edges, { fromConceptId: 'c', toConceptId: 'a', relationType: 'prerequisite_of' })).toThrow(/REL-002/);
  });
  it('farklı türler döngü sayılmaz; silinmiş ilişkiler yok sayılır', () => {
    const edges = [r('1', 'a', 'b'), { ...r('2', 'b', 'a'), deletedAt: '2026-01-01' }];
    expect(() => validateRelation(edges, { fromConceptId: 'b', toConceptId: 'a', relationType: 'related_to' })).not.toThrow();
    expect(() => validateRelation(edges, { fromConceptId: 'b', toConceptId: 'a', relationType: 'part_of' })).not.toThrow();
  });
  it('güncellemede kaydın kendisi hariç tutulur', () => {
    expect(() => validateRelation([r('1', 'a', 'b')], { id: '1', fromConceptId: 'a', toConceptId: 'b', relationType: 'prerequisite_of' })).not.toThrow();
  });
  it('wouldCreateCycle', () => {
    expect(wouldCreateCycle([{ fromConceptId: 'x', toConceptId: 'y' }], 'y', 'x')).toBe(true);
    expect(wouldCreateCycle([{ fromConceptId: 'x', toConceptId: 'y' }], 'x', 'z')).toBe(false);
  });
});
