import { normalizeForSearch, snippetAround } from '../domain/text';
import type { Annotation, Concept, LearningItem, Source, SourceSegment } from '../domain/types';

export type SearchHit =
  | { kind: 'source'; id: string; title: string; snippet: string }
  | { kind: 'segment'; id: string; sourceId: string; title: string; snippet: string; pageNumber?: number }
  | { kind: 'card'; id: string; title: string; snippet: string }
  | { kind: 'concept'; id: string; title: string; snippet: string }
  | { kind: 'note'; id: string; sourceId: string; segmentId: string; title: string; snippet: string };

interface IndexedText {
  norm: string;
  raw: string;
}

/**
 * Hafif yerel arama dizini. Türkçe normalleştirme (İ/ı, ş/s ...) uygulanır.
 * Katlama karakter sayısını korumadığı durumlar olabileceğinden parça konumu ham metinde yeniden aranır.
 */
export class SearchIndex {
  private segments: (SourceSegment & IndexedText)[] = [];
  private sources = new Map<string, Source>();
  private cards: (LearningItem & IndexedText)[] = [];
  private concepts: (Concept & IndexedText)[] = [];
  private notes: (Annotation & IndexedText)[] = [];

  constructor(data: { sources: Source[]; segments: SourceSegment[]; cards: LearningItem[]; concepts: Concept[]; annotations: Annotation[] }) {
    for (const s of data.sources) this.sources.set(s.id, s);
    this.segments = data.segments
      .filter((s) => this.sources.has(s.sourceId))
      .map((s) => ({ ...s, raw: s.text, norm: normalizeForSearch(s.text) }));
    this.cards = data.cards.map((c) => ({ ...c, raw: `${c.prompt} — ${c.answer}`, norm: normalizeForSearch(`${c.prompt} ${c.answer}`) }));
    this.concepts = data.concepts.map((c) => ({ ...c, raw: `${c.label} ${c.description}`, norm: normalizeForSearch(`${c.label} ${c.description} ${c.explanation}`) }));
    this.notes = data.annotations
      .filter((a) => a.noteText)
      .map((a) => ({ ...a, raw: a.noteText!, norm: normalizeForSearch(`${a.noteText} ${a.selectedText ?? ''}`) }));
  }

  get segmentCount(): number {
    return this.segments.length;
  }

  search(query: string, limit = 30): SearchHit[] {
    const q = normalizeForSearch(query);
    if (q.length < 2) return [];
    const terms = q.split(' ').filter(Boolean);
    const matches = (norm: string) => terms.every((t) => norm.includes(t));
    const snippet = (raw: string, norm: string) => {
      const idx = norm.indexOf(terms[0]);
      return snippetAround(raw, Math.max(0, idx), terms[0].length);
    };
    const hits: SearchHit[] = [];
    for (const s of this.sources.values()) {
      if (matches(normalizeForSearch(`${s.title} ${s.tags.join(' ')}`))) hits.push({ kind: 'source', id: s.id, title: s.title, snippet: s.tags.map((t) => `#${t}`).join(' ') });
    }
    for (const c of this.concepts) if (matches(c.norm)) hits.push({ kind: 'concept', id: c.id, title: c.label, snippet: c.description.slice(0, 120) });
    for (const c of this.cards) if (matches(c.norm)) hits.push({ kind: 'card', id: c.id, title: c.prompt, snippet: c.answer.slice(0, 120) });
    for (const n of this.notes) {
      if (matches(n.norm)) hits.push({ kind: 'note', id: n.id, sourceId: n.sourceId, segmentId: n.segmentId, title: this.sources.get(n.sourceId)?.title ?? '', snippet: n.raw.slice(0, 140) });
    }
    for (const s of this.segments) {
      if (hits.length >= limit * 3) break;
      if (matches(s.norm)) {
        hits.push({
          kind: 'segment',
          id: s.id,
          sourceId: s.sourceId,
          title: this.sources.get(s.sourceId)?.title ?? '',
          snippet: snippet(s.raw, s.norm),
          pageNumber: s.pageNumber,
        });
      }
    }
    return hits.slice(0, limit);
  }
}
