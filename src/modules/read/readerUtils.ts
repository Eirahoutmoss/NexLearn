import type { Annotation, SourceSegment } from '../../domain/types';
import type { SelectionPart } from '../../services/annotations';

/** Bir sınır noktasının segment metin kapsayıcısı içindeki karakter konumu. */
function offsetWithin(el: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(el);
  try {
    r.setEnd(node, offset);
  } catch {
    return 0;
  }
  return r.toString().length;
}

/**
 * Geçerli tarayıcı seçimini segment parçalarına çevirir. Seçim okuma alanı dışındaysa null.
 * Metin kapsayıcıları (`data-seg-text`) yalnızca segment metnini içerdiği için ofsetler birebir eşleşir.
 */
export function selectionToParts(container: HTMLElement, segments: readonly SourceSegment[]): SelectionPart[] | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const parts: SelectionPart[] = [];
  for (const el of container.querySelectorAll<HTMLElement>('[data-seg-text]')) {
    if (!range.intersectsNode(el)) continue;
    const idx = Number(el.dataset.segText);
    const seg = segments[idx];
    if (!seg) continue;
    const start = el.contains(range.startContainer) ? offsetWithin(el, range.startContainer, range.startOffset) : 0;
    const end = el.contains(range.endContainer) ? offsetWithin(el, range.endContainer, range.endOffset) : seg.text.length;
    const s = Math.max(0, Math.min(start, seg.text.length));
    const e = Math.max(0, Math.min(end, seg.text.length));
    // Baş/son boşlukları kırp.
    let a = s;
    let b = e;
    while (a < b && /\s/.test(seg.text[a])) a++;
    while (b > a && /\s/.test(seg.text[b - 1])) b--;
    if (b > a) parts.push({ segment: seg, start: a, end: b });
  }
  return parts.length ? parts : null;
}

export function partsText(parts: SelectionPart[]): string {
  return parts.map((p) => p.segment.text.slice(p.start, p.end)).join(' ');
}

export interface Piece {
  text: string;
  start: number;
  annotation?: Annotation;
}

/**
 * Segment metnini vurgu aralıklarına göre parçalar. Çakışmada en son oluşturulan vurgu üstte görünür.
 * Aralığı segment dışına taşan (bozuk) kayıtlar kırpılır.
 */
export function splitPieces(text: string, ranged: readonly Annotation[]): Piece[] {
  const anns = ranged
    .filter((a) => a.startInSegment != null && a.endInSegment != null && a.endInSegment > a.startInSegment)
    .map((a) => ({ a, s: Math.max(0, a.startInSegment!), e: Math.min(text.length, a.endInSegment!) }))
    .filter((x) => x.e > x.s);
  if (!anns.length) return [{ text, start: 0 }];
  const bounds = new Set<number>([0, text.length]);
  for (const x of anns) {
    bounds.add(x.s);
    bounds.add(x.e);
  }
  const sorted = [...bounds].sort((p, q) => p - q);
  const pieces: Piece[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e <= s) continue;
    const covering = anns.filter((x) => x.s <= s && x.e >= e).sort((p, q) => p.a.createdAt.localeCompare(q.a.createdAt));
    const top = covering[covering.length - 1]?.a;
    const prev = pieces[pieces.length - 1];
    if (prev && prev.annotation?.id === top?.id) prev.text += text.slice(s, e);
    else pieces.push({ text: text.slice(s, e), start: s, annotation: top });
  }
  return pieces;
}

/** Okuma oturumunda geçilen segmentlerin kelime sayısı / aktif dakika (yalnızca bilgi amaçlı). */
export function wordsPerMinute(words: number, activeMs: number): number | null {
  if (activeMs < 60_000 || words <= 0) return null;
  return Math.round(words / (activeMs / 60_000));
}
