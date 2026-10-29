import { describe, expect, it } from 'vitest';
import { buildPracticeSet, seededRandom, summarizePractice } from './practice';
import type { LearningItem, ReviewState } from '../domain/types';

const item = (id: string, extra: Partial<LearningItem> = {}) => ({ id, deletedAt: null, sourceRefs: [], conceptIds: [], tags: [], ...extra }) as unknown as LearningItem;

describe('sınav provası', () => {
  const items = [item('a', { sourceRefs: [{ sourceId: 's1' }] }), item('b', { conceptIds: ['c1'] }), item('c', { tags: ['ağ'] }), item('d', { deletedAt: 'x' }), item('e')];
  const states = new Map<string, ReviewState>([['e', { learningItemId: 'e', repetitionCount: 1, intervalDays: 1, easeFactor: 1.5, lapseCount: 2, dueAt: '', lastReviewedAt: '', algorithmVersion: 'sm2-v1', revision: 1 }]]);
  it('kapsama göre süzer, silinenleri almaz', () => {
    expect(buildPracticeSet(items, states, { kind: 'source', sourceId: 's1' }, 10).map((i) => i.id)).toEqual(['a']);
    expect(buildPracticeSet(items, states, { kind: 'concept', conceptId: 'c1' }, 10).map((i) => i.id)).toEqual(['b']);
    expect(buildPracticeSet(items, states, { kind: 'tag', tag: 'ağ' }, 10).map((i) => i.id)).toEqual(['c']);
    expect(buildPracticeSet(items, states, { kind: 'hard' }, 10).map((i) => i.id)).toEqual(['e']);
    expect(buildPracticeSet(items, states, { kind: 'all' }, 10)).toHaveLength(4);
  });
  it('tohumlu karıştırma deterministik ve sayı sınırı uygulanır', () => {
    const a = buildPracticeSet(items, states, { kind: 'all' }, 3, seededRandom(42)).map((i) => i.id);
    const b = buildPracticeSet(items, states, { kind: 'all' }, 3, seededRandom(42)).map((i) => i.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });
  it('özet puanı', () => {
    expect(summarizePractice(['knew', 'partial', 'missed', 'knew'])).toEqual({ total: 4, knew: 2, partial: 1, missed: 1, score: 63 });
  });
});
