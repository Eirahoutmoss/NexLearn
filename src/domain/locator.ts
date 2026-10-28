import type { Locator, SourceSegment } from './types';

/** Segment için kullanıcıya gösterilecek konum etiketi verisi. */
export function describeLocation(seg: Pick<SourceSegment, 'pageNumber' | 'headingPath' | 'index'>): {
  page?: number;
  heading?: string;
  paragraph: number;
} {
  return {
    page: seg.pageNumber,
    heading: seg.headingPath.length ? seg.headingPath[seg.headingPath.length - 1] : undefined,
    paragraph: seg.index + 1,
  };
}

export function makeLocator(seg: { pageNumber?: number; startOffset: number }): Locator {
  return seg.pageNumber != null ? { type: 'page', value: seg.pageNumber } : { type: 'offset', value: seg.startOffset };
}

/** Konumdan segmenti çözer; çözülemezse undefined (kopuk bağlantı açıkça gösterilmeli). */
export function resolveLocator(segments: readonly SourceSegment[], locator: Locator): SourceSegment | undefined {
  if (locator.type === 'page') return segments.find((s) => s.pageNumber === Number(locator.value));
  if (locator.type === 'offset') {
    const v = Number(locator.value);
    return segments.find((s) => v >= s.startOffset && v < s.endOffset) ?? segments.find((s) => s.startOffset >= v);
  }
  return undefined;
}
