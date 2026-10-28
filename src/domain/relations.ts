import { AppError } from './errors';
import type { ConceptRelation, RelationType } from './types';

/** Döngüye izin verilmeyen (sıralı/hiyerarşik) ilişki türleri. */
const ACYCLIC: ReadonlySet<RelationType> = new Set(['prerequisite_of', 'part_of']);
/** Yönsüz kabul edilen ilişki türleri: A↔B yinelemesi aynı sayılır. */
const SYMMETRIC: ReadonlySet<RelationType> = new Set(['contrasts_with', 'related_to']);

/**
 * Yeni ilişkiyi mevcut (silinmemiş) ilişkilere göre doğrular.
 * Hatalar: REL-001 kendine ilişki, REL-003 yinelenen, REL-002 döngü.
 */
export function validateRelation(
  existing: readonly Pick<ConceptRelation, 'id' | 'fromConceptId' | 'toConceptId' | 'relationType' | 'deletedAt'>[],
  candidate: { id?: string; fromConceptId: string; toConceptId: string; relationType: RelationType },
): void {
  const { fromConceptId: from, toConceptId: to, relationType: type } = candidate;
  if (from === to) throw new AppError('REL-001');
  const live = existing.filter((r) => !r.deletedAt && r.id !== candidate.id);
  const dup = live.some(
    (r) =>
      r.relationType === type &&
      ((r.fromConceptId === from && r.toConceptId === to) ||
        (SYMMETRIC.has(type) && r.fromConceptId === to && r.toConceptId === from)),
  );
  if (dup) throw new AppError('REL-003');
  if (ACYCLIC.has(type) && wouldCreateCycle(live.filter((r) => r.relationType === type), from, to)) {
    throw new AppError('REL-002');
  }
}

/** from→to eklenirse, to'dan from'a mevcut bir yol var mı? */
export function wouldCreateCycle(
  edges: readonly Pick<ConceptRelation, 'fromConceptId' | 'toConceptId'>[],
  from: string,
  to: string,
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.fromConceptId) ?? [];
    list.push(e.toConceptId);
    adj.set(e.fromConceptId, list);
  }
  const stack = [to];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of adj.get(n) ?? []) stack.push(m);
  }
  return false;
}
