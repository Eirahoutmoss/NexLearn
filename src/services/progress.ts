import type { Annotation, ApplicationTask, Concept, ConceptRelation, LearningItem, LearningSession, ReviewEvent, ReviewState } from '../domain/types';

/**
 * Cihaz üzerinde hesaplanan öğrenme metrikleri. Hiçbiri dışarı gönderilmez.
 * Okuma, hatırlama ve uygulama bilinçli olarak AYRI tutulur (dürüst ölçüm ilkesi).
 */

const DAY = 86_400_000;

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function lastNDays(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push(localDateKey(d));
  }
  return out;
}

export interface Rate {
  attempts: number;
  successes: number;
  /** 0-100; deneme yoksa null (sahte %0 gösterilmez). */
  percent: number | null;
}

function rate(events: ReviewEvent[]): Rate {
  const successes = events.filter((e) => e.rating >= 3).length;
  return { attempts: events.length, successes, percent: events.length ? Math.round((successes / events.length) * 100) : null };
}

/** Bir tekrarın önceki görüşmeden (ya da kart oluşturulmasından) bu yana geçen süre. */
export function gapMs(e: ReviewEvent, item?: Pick<LearningItem, 'createdAt'>): number | null {
  const prev = e.scheduleBefore.lastReviewedAt ?? item?.createdAt ?? null;
  if (!prev) return null;
  return new Date(e.reviewedAt).getTime() - new Date(prev).getTime();
}

export interface RecallBreakdown {
  /** Aynı gün içinde (aralık < 1 gün): anlık doğruluk. */
  immediate: Rate;
  /** 1–7 gün sonra hatırlama. */
  oneDay: Rate;
  /** 7+ gün sonra hatırlama. */
  oneWeek: Rate;
}

export function recallBreakdown(events: ReviewEvent[], items: Pick<LearningItem, 'id' | 'createdAt'>[]): RecallBreakdown {
  const byId = new Map(items.map((i) => [i.id, i]));
  const imm: ReviewEvent[] = [];
  const d1: ReviewEvent[] = [];
  const d7: ReviewEvent[] = [];
  for (const e of events) {
    const g = gapMs(e, byId.get(e.learningItemId));
    if (g == null || g < DAY) imm.push(e);
    else if (g < 7 * DAY) d1.push(e);
    else d7.push(e);
  }
  return { immediate: rate(imm), oneDay: rate(d1), oneWeek: rate(d7) };
}

export function readingMinutesByDay(sessions: LearningSession[], days: string[]): number[] {
  const map = new Map(days.map((d) => [d, 0]));
  for (const s of sessions) {
    if (s.sessionType !== 'reading') continue;
    const k = localDateKey(new Date(s.startedAt));
    if (map.has(k)) map.set(k, map.get(k)! + s.durationMs / 60000);
  }
  return days.map((d) => Math.round(map.get(d)! * 10) / 10);
}

export function countByDay<T>(records: T[], dateOf: (r: T) => string, days: string[]): number[] {
  const map = new Map(days.map((d) => [d, 0]));
  for (const r of records) {
    const k = localDateKey(new Date(dateOf(r)));
    if (map.has(k)) map.set(k, map.get(k)! + 1);
  }
  return days.map((d) => map.get(d)!);
}

export function totalReadingMinutes(sessions: LearningSession[], sinceMs?: number): number {
  return Math.round(
    sessions
      .filter((s) => s.sessionType === 'reading' && (sinceMs == null || new Date(s.startedAt).getTime() >= sinceMs))
      .reduce((n, s) => n + s.durationMs, 0) / 60000,
  );
}

export function hardCards(items: LearningItem[], states: Map<string, ReviewState>): { item: LearningItem; state: ReviewState }[] {
  return items
    .map((item) => ({ item, state: states.get(item.id)! }))
    .filter((e) => e.state && e.state.repetitionCount + e.state.lapseCount > 0 && (e.state.lapseCount >= 2 || e.state.easeFactor <= 1.7))
    .sort((a, b) => b.state.lapseCount - a.state.lapseCount || a.state.easeFactor - b.state.easeFactor);
}

export interface LearningSummary {
  sources: number;
  cards: number;
  concepts: number;
  confirmedConcepts: number;
  confirmedRelations: number;
  explanations: number;
  taskAttempts: number;
  tasksDone: number;
  reviews: number;
}

export function summarize(input: {
  sources: number;
  items: LearningItem[];
  concepts: Concept[];
  relations: ConceptRelation[];
  annotations: Annotation[];
  tasks: ApplicationTask[];
  events: ReviewEvent[];
}): LearningSummary {
  const attempts = input.tasks.flatMap((t) => t.attempts);
  return {
    sources: input.sources,
    cards: input.items.length,
    concepts: input.concepts.length,
    confirmedConcepts: input.concepts.filter((c) => c.userConfirmed).length,
    confirmedRelations: input.relations.filter((r) => r.userConfirmed).length,
    explanations:
      input.annotations.filter((a) => a.annotationType === 'explanation').length +
      input.concepts.filter((c) => c.explanation.trim()).length,
    taskAttempts: attempts.length,
    tasksDone: input.tasks.filter((t) => t.attempts.some((a) => a.selfAssessment === 'done')).length,
    reviews: input.events.length,
  };
}

export interface TodayProgress {
  reviews: number;
  readingMinutes: number;
  notes: number;
  taskAttempts: number;
}

export function todayProgress(
  now: Date,
  events: ReviewEvent[],
  sessions: LearningSession[],
  annotations: Annotation[],
  tasks: ApplicationTask[],
): TodayProgress {
  const today = localDateKey(now);
  const isToday = (iso: string) => localDateKey(new Date(iso)) === today;
  return {
    reviews: events.filter((e) => isToday(e.reviewedAt)).length,
    readingMinutes: Math.round(
      sessions.filter((s) => s.sessionType === 'reading' && isToday(s.startedAt)).reduce((n, s) => n + s.durationMs, 0) / 60000,
    ),
    notes: annotations.filter((a) => (a.annotationType === 'note' || a.annotationType === 'explanation') && isToday(a.createdAt)).length,
    taskAttempts: tasks.flatMap((t) => t.attempts).filter((a) => isToday(a.at)).length,
  };
}
