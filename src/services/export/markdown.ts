import type { BackupData } from '../backup/backup';
import type { SourceSegment } from '../../domain/types';

/** Notları ve çalışma materyallerini okunabilir Markdown olarak dışa aktarır (yalnızca silinmemiş kayıtlar). */
export function notesMarkdown(d: BackupData, labels: {
  title: string; highlights: string; notes: string; explanations: string; cards: string; concepts: string; tasks: string;
  page: string; question: string; answer: string; relationLabel: (t: string) => string; exportedAt: string;
}): string {
  const live = <T extends { deletedAt?: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
  const segs = new Map<string, SourceSegment>(d.segments.map((s) => [s.id, s]));
  const out: string[] = [`# ${labels.title}`, '', `_${labels.exportedAt}: ${d.createdAt}_`, ''];
  const md = (s: string) => s.replace(/\r?\n/g, ' ').trim();

  for (const src of live(d.sources)) {
    const anns = live(d.annotations).filter((a) => a.sourceId === src.id);
    const cards = live(d.items).filter((i) => i.sourceRefs.some((r) => r.sourceId === src.id));
    if (!anns.length && !cards.length) continue;
    out.push(`## ${md(src.title)}`, '');
    const loc = (segmentId: string) => {
      const p = segs.get(segmentId)?.pageNumber;
      return p ? ` (${labels.page} ${p})` : '';
    };
    const hl = anns.filter((a) => a.annotationType === 'highlight' || a.annotationType === 'quote');
    if (hl.length) {
      out.push(`### ${labels.highlights}`, '');
      for (const a of hl) {
        out.push(`> ${md(a.selectedText ?? '')}${loc(a.segmentId)}`);
        if (a.noteText) out.push('', `- ${md(a.noteText)}`);
        out.push('');
      }
    }
    const notes = anns.filter((a) => a.annotationType === 'note');
    if (notes.length) {
      out.push(`### ${labels.notes}`, '');
      for (const a of notes) out.push(`- ${md(a.noteText ?? '')}${loc(a.segmentId)}`);
      out.push('');
    }
    const ex = anns.filter((a) => a.annotationType === 'explanation');
    if (ex.length) {
      out.push(`### ${labels.explanations}`, '');
      for (const a of ex) out.push(`- ${md(a.noteText ?? '')}${loc(a.segmentId)}`);
      out.push('');
    }
    if (cards.length) {
      out.push(`### ${labels.cards}`, '');
      for (const c of cards) out.push(`- **${labels.question}:** ${md(c.prompt)}`, `  **${labels.answer}:** ${md(c.answer)}`);
      out.push('');
    }
  }

  const concepts = live(d.concepts);
  if (concepts.length) {
    const byId = new Map(concepts.map((c) => [c.id, c]));
    out.push(`## ${labels.concepts}`, '');
    for (const c of concepts) {
      out.push(`### ${md(c.label)}`, '');
      if (c.description) out.push(md(c.description), '');
      if (c.explanation) out.push(`> ${md(c.explanation)}`, '');
      for (const r of live(d.relations).filter((r) => r.fromConceptId === c.id)) {
        const to = byId.get(r.toConceptId);
        if (to) out.push(`- ${labels.relationLabel(r.relationType)} → ${md(to.label)}`);
      }
      out.push('');
    }
  }

  const tasks = live(d.tasks);
  if (tasks.length) {
    out.push(`## ${labels.tasks}`, '');
    for (const t of tasks) {
      out.push(`- ${md(t.prompt)}`);
      for (const a of t.attempts) out.push(`  - ${a.at.slice(0, 10)} — ${md(a.response)}`);
    }
    out.push('');
  }
  return out.join('\n');
}
