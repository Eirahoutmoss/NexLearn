import { emitChange, getDb } from '../adapters/storage/db';
import { createEntity, listLive, softDelete, updateEntity } from '../adapters/storage/repo';
import { AppError } from '../domain/errors';
import { newId } from '../domain/ids';
import type { Annotation, AnnotationType, HighlightColor, SourceSegment } from '../domain/types';

export const HIGHLIGHT_COLORS: readonly HighlightColor[] = ['important', 'question', 'definition', 'example', 'review'];

export interface SelectionPart {
  segment: SourceSegment;
  start: number;
  end: number;
}

/** Seçimi (bir ya da birden çok segmente yayılan) vurgu/alıntı kayıtlarına dönüştürür. */
export async function createRangeAnnotations(
  type: Extract<AnnotationType, 'highlight' | 'quote' | 'note'>,
  parts: SelectionPart[],
  opts: { color?: HighlightColor; noteText?: string } = {},
): Promise<Annotation[]> {
  const valid = parts.filter((p) => p.end > p.start && p.start >= 0 && p.end <= p.segment.text.length);
  if (!valid.length) throw new AppError('VAL-001', 'selection');
  const groupId = valid.length > 1 ? newId('grp') : undefined;
  const out: Annotation[] = [];
  for (const [i, p] of valid.entries()) {
    out.push(
      await createEntity('annotations', {
        sourceId: p.segment.sourceId,
        segmentId: p.segment.id,
        annotationType: type,
        color: type === 'highlight' ? (opts.color ?? 'important') : opts.color,
        selectedText: p.segment.text.slice(p.start, p.end),
        startInSegment: p.start,
        endInSegment: p.end,
        ...(groupId ? { groupId } : {}),
        // Not metni grubun ilk parçasında tutulur.
        noteText: i === 0 ? opts.noteText?.trim() || undefined : undefined,
        tags: extractTags(opts.noteText ?? ''),
      }),
    );
  }
  return out;
}

/** Paragrafın tamamına not/yer imi/açıklama ekler. */
export async function createSegmentAnnotation(
  type: Extract<AnnotationType, 'note' | 'bookmark' | 'explanation' | 'highlight' | 'quote'>,
  segment: SourceSegment,
  opts: { noteText?: string; color?: HighlightColor } = {},
): Promise<Annotation> {
  if ((type === 'note' || type === 'explanation') && !opts.noteText?.trim()) throw new AppError('VAL-001', 'note');
  return createEntity('annotations', {
    sourceId: segment.sourceId,
    segmentId: segment.id,
    annotationType: type,
    color: type === 'highlight' ? (opts.color ?? 'important') : undefined,
    selectedText: type === 'highlight' || type === 'quote' ? segment.text : undefined,
    startInSegment: type === 'highlight' || type === 'quote' ? 0 : undefined,
    endInSegment: type === 'highlight' || type === 'quote' ? segment.text.length : undefined,
    noteText: opts.noteText?.trim() || undefined,
    tags: extractTags(opts.noteText ?? ''),
  });
}

/** Not metnindeki #etiketleri çıkarır (Türkçe harfler dahil). */
export function extractTags(text: string): string[] {
  const m = text.match(/(?:^|\s)#([\p{L}\p{N}_-]{1,40})/gu) ?? [];
  return [...new Set(m.map((t) => t.trim().slice(1).toLocaleLowerCase('tr-TR')))];
}

export async function updateAnnotation(id: string, patch: { noteText?: string; color?: HighlightColor }): Promise<void> {
  await updateEntity('annotations', id, {
    ...patch,
    ...(patch.noteText != null ? { tags: extractTags(patch.noteText), noteText: patch.noteText.trim() || undefined } : {}),
  });
}

export async function deleteAnnotation(annotation: Annotation): Promise<void> {
  if (annotation.groupId) {
    const group = (await listLive('annotations')).filter((a) => a.groupId === annotation.groupId);
    for (const a of group) await softDelete('annotations', a.id);
  } else {
    await softDelete('annotations', annotation.id);
  }
}

export async function listAnnotationsForSource(sourceId: string): Promise<Annotation[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('annotations', 'sourceId', sourceId);
  return all.filter((a) => !a.deletedAt);
}

export const listAllAnnotations = () => listLive('annotations');

export async function toggleBookmark(segment: SourceSegment): Promise<boolean> {
  const existing = (await listAnnotationsForSource(segment.sourceId)).find(
    (a) => a.annotationType === 'bookmark' && a.segmentId === segment.id,
  );
  if (existing) {
    await softDelete('annotations', existing.id);
    return false;
  }
  await createSegmentAnnotation('bookmark', segment);
  emitChange(['annotations']);
  return true;
}
