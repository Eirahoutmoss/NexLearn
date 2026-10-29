import { emitChange, getDb } from '../adapters/storage/db';
import { buildEntity, listLive, updateEntity } from '../adapters/storage/repo';
import { AppError } from '../domain/errors';
import { newId, nowIso } from '../domain/ids';
import { ALGORITHM_VERSION, BUTTON_RATING, endOfLocalDay, explainSchedule, initialSchedule, schedule, type ScheduleReason } from '../domain/scheduler';
import { normalizeForSearch } from '../domain/text';
import type { LearningItem, LearningItemType, ReviewButton, ReviewEvent, ReviewState, ScheduleSnapshot, SourceRef } from '../domain/types';

export interface CardInput {
  itemType?: LearningItemType;
  prompt: string;
  answer: string;
  explanation?: string;
  sourceRefs?: SourceRef[];
  conceptIds?: string[];
  tags?: string[];
}

export const LONG_ANSWER_CHARS = 300;

export type CardWarning = 'longAnswer' | 'duplicatePrompt' | 'noSource' | 'answerInPrompt';

/** Kart kalite kontrolü (bkz. docs/DATA_MODEL.md). Hatalar engeller, uyarılar yalnızca bilgilendirir. */
export function checkCardQuality(input: CardInput, existing: readonly LearningItem[] = []): CardWarning[] {
  const warnings: CardWarning[] = [];
  if (input.answer.trim().length > LONG_ANSWER_CHARS) warnings.push('longAnswer');
  const p = normalizeForSearch(input.prompt);
  if (p && existing.some((e) => !e.deletedAt && normalizeForSearch(e.prompt) === p)) warnings.push('duplicatePrompt');
  if (!input.sourceRefs?.length) warnings.push('noSource');
  const a = normalizeForSearch(input.answer);
  if (a.length > 3 && p.includes(a)) warnings.push('answerInPrompt');
  return warnings;
}

function validate(input: CardInput): void {
  if (!input.prompt.trim()) throw new AppError('VAL-001', 'prompt');
  if (!input.answer.trim()) throw new AppError('VAL-001', 'answer');
}

/** Kart ve ilk tekrar durumunu tek işlemde oluşturur. Yeni kart hemen tekrar kuyruğuna girer. */
export async function createCard(input: CardInput, opts: { isSample?: boolean; now?: Date } = {}): Promise<LearningItem> {
  validate(input);
  const now = opts.now ?? new Date();
  const item = buildEntity(
    'items',
    {
      itemType: input.itemType ?? 'qa',
      prompt: input.prompt.trim(),
      answer: input.answer.trim(),
      explanation: input.explanation?.trim() ?? '',
      sourceRefs: input.sourceRefs ?? [],
      conceptIds: input.conceptIds ?? [],
      tags: input.tags ?? [],
      suspended: false,
      provenance: 'user',
      ...(opts.isSample ? { isSample: true } : {}),
    },
    now,
  );
  const state: ReviewState = {
    learningItemId: item.id,
    ...initialSchedule(now),
    algorithmVersion: ALGORITHM_VERSION,
    revision: 1,
    ...(opts.isSample ? { isSample: true } : {}),
  };
  const db = await getDb();
  const tx = db.transaction(['items', 'reviewStates'], 'readwrite');
  await tx.objectStore('items').add(item);
  await tx.objectStore('reviewStates').add(state);
  await tx.done;
  emitChange(['items', 'reviewStates']);
  return item;
}

export async function updateCard(id: string, input: CardInput, expectedRevision?: number): Promise<LearningItem> {
  validate(input);
  return updateEntity(
    'items',
    id,
    {
      prompt: input.prompt.trim(),
      answer: input.answer.trim(),
      explanation: input.explanation?.trim() ?? '',
      ...(input.sourceRefs ? { sourceRefs: input.sourceRefs } : {}),
      ...(input.conceptIds ? { conceptIds: input.conceptIds } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.itemType ? { itemType: input.itemType } : {}),
    },
    expectedRevision,
  );
}

export const setSuspended = (id: string, suspended: boolean) => updateEntity('items', id, { suspended });
export const trashCard = (id: string) => updateEntity('items', id, { deletedAt: nowIso() });
export const restoreCard = (id: string) => updateEntity('items', id, { deletedAt: null });

/** Kartı ve tekrar verisini kalıcı siler (ayrı, onaylı işlem). */
export async function purgeCard(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['items', 'reviewStates', 'reviewEvents'], 'readwrite');
  await tx.objectStore('items').delete(id);
  await tx.objectStore('reviewStates').delete(id);
  let c = await tx.objectStore('reviewEvents').index('learningItemId').openCursor(id);
  while (c) {
    await c.delete();
    c = await c.continue();
  }
  await tx.done;
  emitChange(['items', 'reviewStates', 'reviewEvents']);
}

export const listCards = () => listLive('items');

export async function listReviewStates(): Promise<Map<string, ReviewState>> {
  const db = await getDb();
  return new Map((await db.getAll('reviewStates')).map((s) => [s.learningItemId, s]));
}

export async function listReviewEvents(itemId?: string): Promise<ReviewEvent[]> {
  const db = await getDb();
  const events = itemId ? await db.getAllFromIndex('reviewEvents', 'learningItemId', itemId) : await db.getAll('reviewEvents');
  return events.sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
}

export interface QueueEntry {
  item: LearningItem;
  state: ReviewState;
}

/** Bugünün kuyruğu: askıya alınmamış, silinmemiş ve vadesi yerel gün sonuna kadar gelen kartlar; en eski vade önce. */
export async function getDueQueue(now: Date = new Date()): Promise<QueueEntry[]> {
  const [items, states] = await Promise.all([listCards(), listReviewStates()]);
  const limit = endOfLocalDay(now).getTime();
  return items
    .filter((i) => !i.suspended)
    .map((item) => ({ item, state: states.get(item.id)! }))
    .filter((e) => e.state && new Date(e.state.dueAt).getTime() <= limit)
    .sort((a, b) => a.state.dueAt.localeCompare(b.state.dueAt) || a.item.createdAt.localeCompare(b.item.createdAt));
}

/** Bir sonraki vade zamanı (kuyruk boşken bilgi vermek için). */
export async function getNextDue(now: Date = new Date()): Promise<string | null> {
  const [items, states] = await Promise.all([listCards(), listReviewStates()]);
  const limit = endOfLocalDay(now).getTime();
  let next: string | null = null;
  for (const i of items) {
    if (i.suspended) continue;
    const s = states.get(i.id);
    if (!s || new Date(s.dueAt).getTime() <= limit) continue;
    if (!next || s.dueAt < next) next = s.dueAt;
  }
  return next;
}

function snapshot(s: ReviewState): ScheduleSnapshot {
  return {
    repetitionCount: s.repetitionCount,
    intervalDays: s.intervalDays,
    easeFactor: s.easeFactor,
    lapseCount: s.lapseCount,
    dueAt: s.dueAt,
    lastReviewedAt: s.lastReviewedAt,
  };
}

export interface ReviewResult {
  state: ReviewState;
  event: ReviewEvent;
  reason: ScheduleReason;
}

/** Tekrarı kaydeder: durum ve olay tek işlemde yazılır (yarım kayıt oluşmaz). */
export async function recordReview(
  itemId: string,
  button: ReviewButton,
  opts: { now?: Date; responseDurationMs?: number; answerText?: string } = {},
): Promise<ReviewResult> {
  const now = opts.now ?? new Date();
  const rating = BUTTON_RATING[button];
  const db = await getDb();
  const tx = db.transaction(['reviewStates', 'reviewEvents', 'items'], 'readwrite');
  const item = await tx.objectStore('items').get(itemId);
  const current = await tx.objectStore('reviewStates').get(itemId);
  if (!item || item.deletedAt || !current) {
    tx.done.catch(() => undefined);
    tx.abort();
    throw new AppError('DB-004', 'reviewStates');
  }
  const before = snapshot(current);
  const after = schedule(before, rating, now);
  const state: ReviewState = { ...current, ...after, algorithmVersion: ALGORITHM_VERSION, revision: current.revision + 1 };
  const event: ReviewEvent = {
    id: newId('re'),
    learningItemId: itemId,
    reviewedAt: now.toISOString(),
    rating,
    button,
    ...(opts.responseDurationMs != null ? { responseDurationMs: Math.round(opts.responseDurationMs) } : {}),
    ...(opts.answerText?.trim() ? { answerText: opts.answerText.trim().slice(0, 2000) } : {}),
    scheduleBefore: before,
    scheduleAfter: after,
    ...(item.isSample ? { isSample: true } : {}),
  };
  await tx.objectStore('reviewStates').put(state);
  await tx.objectStore('reviewEvents').add(event);
  await tx.done;
  emitChange(['reviewStates', 'reviewEvents']);
  return { state, event, reason: explainSchedule(before, after, rating) };
}
