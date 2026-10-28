import { emitChange, getDb } from '../adapters/storage/db';
import { createEntity, listLive, softDelete, updateEntity } from '../adapters/storage/repo';
import { AppError } from '../domain/errors';
import { newId, nowIso } from '../domain/ids';
import { validateRelation } from '../domain/relations';
import { normalizeForSearch } from '../domain/text';
import type { ApplicationTask, Concept, ConceptRelation, RelationType, SourceRef, TaskAttempt } from '../domain/types';

export interface ConceptInput {
  label: string;
  description?: string;
  explanation?: string;
  examples?: string[];
  sourceRefs?: SourceRef[];
  userConfirmed?: boolean;
}

export const listConcepts = () => listLive('concepts');
export const listRelations = () => listLive('relations');

export async function createConcept(input: ConceptInput, opts: { isSample?: boolean } = {}): Promise<Concept> {
  const label = input.label.trim();
  if (!label) throw new AppError('VAL-001', 'label');
  return createEntity('concepts', {
    label: label.slice(0, 120),
    description: input.description?.trim() ?? '',
    explanation: input.explanation?.trim() ?? '',
    examples: (input.examples ?? []).map((e) => e.trim()).filter(Boolean),
    userConfirmed: input.userConfirmed ?? true,
    provenance: 'user',
    sourceRefs: input.sourceRefs ?? [],
    position: null,
    ...(opts.isSample ? { isSample: true } : {}),
  });
}

/** Aynı adda kavram var mı? (Türkçe duyarlı karşılaştırma) */
export async function findConceptByLabel(label: string): Promise<Concept | undefined> {
  const key = normalizeForSearch(label);
  return (await listConcepts()).find((c) => normalizeForSearch(c.label) === key);
}

export async function updateConcept(id: string, patch: Partial<ConceptInput> & { position?: { x: number; y: number } | null }): Promise<Concept> {
  if (patch.label != null && !patch.label.trim()) throw new AppError('VAL-001', 'label');
  return updateEntity('concepts', id, {
    ...patch,
    ...(patch.label != null ? { label: patch.label.trim().slice(0, 120) } : {}),
    ...(patch.examples ? { examples: patch.examples.map((e) => e.trim()).filter(Boolean) } : {}),
  });
}

export async function addConceptSourceRef(id: string, ref: SourceRef): Promise<void> {
  const c = (await listConcepts()).find((x) => x.id === id);
  if (!c) throw new AppError('DB-004', 'concepts');
  if (c.sourceRefs.some((r) => r.sourceId === ref.sourceId && r.segmentId === ref.segmentId)) return;
  await updateEntity('concepts', id, { sourceRefs: [...c.sourceRefs, ref] });
}

export interface ConceptImpact {
  relations: number;
  cards: number;
  tasks: number;
}

/** Silmeden önce etkilenecek bağlantıları sayar (kullanıcıya gösterilir). */
export async function conceptImpact(id: string): Promise<ConceptImpact> {
  const [rels, items, tasks] = await Promise.all([listRelations(), listLive('items'), listLive('tasks')]);
  return {
    relations: rels.filter((r) => r.fromConceptId === id || r.toConceptId === id).length,
    cards: items.filter((i) => i.conceptIds.includes(id)).length,
    tasks: tasks.filter((t) => t.conceptIds.includes(id)).length,
  };
}

/**
 * Kavramı çöp kutusuna taşır. Bağlı ilişkiler de yumuşak silinir; kart ve görevler korunur,
 * yalnızca kavram bağlantısı kaldırılır. Hepsi tek işlemde yapılır.
 */
export async function trashConcept(id: string): Promise<void> {
  const db = await getDb();
  const ts = nowIso();
  const tx = db.transaction(['concepts', 'relations', 'items', 'tasks'], 'readwrite');
  const c = await tx.objectStore('concepts').get(id);
  if (!c) {
    tx.done.catch(() => undefined);
    tx.abort();
    throw new AppError('DB-004', 'concepts');
  }
  await tx.objectStore('concepts').put({ ...c, deletedAt: ts, updatedAt: ts, revision: c.revision + 1 });
  for (const r of await tx.objectStore('relations').getAll()) {
    if (!r.deletedAt && (r.fromConceptId === id || r.toConceptId === id)) {
      await tx.objectStore('relations').put({ ...r, deletedAt: ts, updatedAt: ts, revision: r.revision + 1 });
    }
  }
  for (const store of ['items', 'tasks'] as const) {
    for (const rec of await tx.objectStore(store).getAll()) {
      if (rec.conceptIds.includes(id)) {
        await tx.objectStore(store).put({ ...rec, conceptIds: rec.conceptIds.filter((x) => x !== id), updatedAt: ts, revision: rec.revision + 1 } as never);
      }
    }
  }
  await tx.done;
  emitChange(['concepts', 'relations', 'items', 'tasks']);
}

export async function restoreConcept(id: string): Promise<void> {
  await updateEntity('concepts', id, { deletedAt: null });
}

export async function purgeConcept(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['concepts', 'relations'], 'readwrite');
  await tx.objectStore('concepts').delete(id);
  for (const r of await tx.objectStore('relations').getAll()) {
    if (r.fromConceptId === id || r.toConceptId === id) await tx.objectStore('relations').delete(r.id);
  }
  await tx.done;
  emitChange(['concepts', 'relations']);
}

export async function createRelation(
  input: { fromConceptId: string; toConceptId: string; relationType: RelationType; sourceRefs?: SourceRef[] },
  opts: { isSample?: boolean } = {},
): Promise<ConceptRelation> {
  const existing = await listRelations();
  validateRelation(existing, input);
  return createEntity('relations', {
    fromConceptId: input.fromConceptId,
    toConceptId: input.toConceptId,
    relationType: input.relationType,
    provenance: 'user',
    sourceRefs: input.sourceRefs ?? [],
    userConfirmed: true,
    confidence: null,
    ...(opts.isSample ? { isSample: true } : {}),
  });
}

export async function updateRelationType(id: string, relationType: RelationType): Promise<void> {
  const all = await listRelations();
  const r = all.find((x) => x.id === id);
  if (!r) throw new AppError('DB-004', 'relations');
  validateRelation(all, { id, fromConceptId: r.fromConceptId, toConceptId: r.toConceptId, relationType });
  await updateEntity('relations', id, { relationType });
}

export const confirmRelation = (id: string, userConfirmed: boolean) => updateEntity('relations', id, { userConfirmed });
export const deleteRelation = (id: string) => softDelete('relations', id);

/* ---------- Uygulama görevleri ---------- */

export const listTasks = () => listLive('tasks');

export async function createTask(
  input: { prompt: string; conceptIds?: string[]; sourceRefs?: SourceRef[] },
  opts: { isSample?: boolean } = {},
): Promise<ApplicationTask> {
  if (!input.prompt.trim()) throw new AppError('VAL-001', 'prompt');
  return createEntity('tasks', {
    prompt: input.prompt.trim(),
    conceptIds: input.conceptIds ?? [],
    sourceRefs: input.sourceRefs ?? [],
    attempts: [],
    ...(opts.isSample ? { isSample: true } : {}),
  });
}

export async function updateTaskPrompt(id: string, prompt: string): Promise<void> {
  if (!prompt.trim()) throw new AppError('VAL-001', 'prompt');
  await updateEntity('tasks', id, { prompt: prompt.trim() });
}

export async function addTaskAttempt(id: string, response: string, selfAssessment: TaskAttempt['selfAssessment']): Promise<void> {
  if (!response.trim()) throw new AppError('VAL-001', 'response');
  const task = (await listTasks()).find((t) => t.id === id);
  if (!task) throw new AppError('DB-004', 'tasks');
  const attempt: TaskAttempt = { id: newId('att'), at: nowIso(), response: response.trim(), selfAssessment };
  await updateEntity('tasks', id, { attempts: [...task.attempts, attempt] });
}

export const trashTask = (id: string) => softDelete('tasks', id);

/** Kavram için keşfettirici yönlendirme soruları (deterministik, modelsiz). */
export const GUIDING_QUESTION_KEYS = ['prereq', 'partOf', 'example', 'contrast', 'apply', 'ownWords'] as const;
