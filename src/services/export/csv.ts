import type { LearningItem, ReviewEvent, ReviewState, Source } from '../../domain/types';

/** CSV hücresi: tırnaklama + formül enjeksiyonuna karşı koruma (=,+,-,@ ile başlayan değerler). */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: unknown[][]): string {
  // Excel'in Türkçe karakterleri doğru tanıması için UTF-8 BOM eklenir.
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function cardsCsv(items: LearningItem[], states: Map<string, ReviewState>, sources: Map<string, Source>): string {
  const header = ['id', 'type', 'prompt', 'answer', 'explanation', 'tags', 'suspended', 'repetitions', 'intervalDays', 'easeFactor', 'lapses', 'dueAt', 'lastReviewedAt', 'source', 'page', 'createdAt'];
  const rows = items.map((i) => {
    const s = states.get(i.id);
    const ref = i.sourceRefs[0];
    return [
      i.id, i.itemType, i.prompt, i.answer, i.explanation, i.tags.join(' '), i.suspended,
      s?.repetitionCount ?? '', s?.intervalDays ?? '', s?.easeFactor ?? '', s?.lapseCount ?? '', s?.dueAt ?? '', s?.lastReviewedAt ?? '',
      ref ? (sources.get(ref.sourceId)?.title ?? '') : '', ref?.pageNumber ?? '', i.createdAt,
    ];
  });
  return toCsv([header, ...rows]);
}

export function reviewEventsCsv(events: ReviewEvent[], items: Map<string, LearningItem>): string {
  const header = ['id', 'cardId', 'prompt', 'reviewedAt', 'rating', 'button', 'intervalBefore', 'intervalAfter', 'easeAfter', 'responseMs'];
  const rows = events.map((e) => [
    e.id, e.learningItemId, items.get(e.learningItemId)?.prompt ?? '', e.reviewedAt, e.rating, e.button,
    e.scheduleBefore.intervalDays, e.scheduleAfter.intervalDays, e.scheduleAfter.easeFactor, e.responseDurationMs ?? '',
  ]);
  return toCsv([header, ...rows]);
}
