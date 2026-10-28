import { getDb, emitChange } from '../adapters/storage/db';
import { newId, nowIso } from '../domain/ids';
import type { LearningSession, ReadingState, SessionType } from '../domain/types';

export async function getReadingState(sourceId: string): Promise<ReadingState | undefined> {
  const db = await getDb();
  return db.get('readingStates', sourceId);
}

export async function getAllReadingStates(): Promise<ReadingState[]> {
  const db = await getDb();
  return db.getAll('readingStates');
}

/** Okuma konumunu kaydeder; ilerleme için en ileri konum korunur. */
export async function saveReadingPosition(sourceId: string, segmentIndex: number): Promise<ReadingState> {
  const db = await getDb();
  const tx = db.transaction('readingStates', 'readwrite');
  const cur = await tx.store.get(sourceId);
  const next: ReadingState = {
    sourceId,
    segmentIndex,
    maxSegmentIndex: Math.max(cur?.maxSegmentIndex ?? 0, segmentIndex),
    updatedAt: nowIso(),
    ...(cur?.isSample ? { isSample: true } : {}),
  };
  await tx.store.put(next);
  await tx.done;
  emitChange(['readingStates']);
  return next;
}

/** Okuma ilerlemesi yüzdesi (0-100). Segment sayısı bilinmiyorsa 0. */
export function progressPercent(state: ReadingState | undefined, segmentCount: number): number {
  if (!state || segmentCount <= 0) return 0;
  if (segmentCount === 1) return 100;
  return Math.min(100, Math.round(((state.maxSegmentIndex + 1) / segmentCount) * 100));
}

export async function recordSession(
  sessionType: SessionType,
  startedAt: Date,
  endedAt: Date,
  activeMs: number,
  sourceIds: string[],
  activitySummary: Record<string, number> = {},
): Promise<LearningSession | null> {
  // 5 saniyeden kısa etkinlikler kaydedilmez (yanlışlıkla açılan sayfalar).
  if (activeMs < 5000) return null;
  const session: LearningSession = {
    id: newId('ses'),
    sessionType,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.round(activeMs),
    sourceIds,
    activitySummary,
  };
  const db = await getDb();
  await db.add('sessions', session);
  emitChange(['sessions']);
  return session;
}

export async function listSessions(): Promise<LearningSession[]> {
  const db = await getDb();
  return db.getAll('sessions');
}
