import { FileText, FileType2, Image as ImageIcon, NotebookPen, ClipboardPaste, BookOpen } from 'lucide-react';
import type { Source } from '../domain/types';

const PALETTE = ['var(--mod-read)', 'var(--mod-memory)', 'var(--mod-learn)', 'var(--mod-apply)'];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const SOURCE_ICONS = { pdf: FileType2, txt: FileText, markdown: BookOpen, note: NotebookPen, paste: ClipboardPaste, image: ImageIcon } as const;

/** Kaynak için kimliğinden türetilen, gerçek içerik iddiası taşımayan sade kapak. */
export function SourceCover({ source, thumbUrl }: { source: Pick<Source, 'id' | 'title' | 'sourceType'>; thumbUrl?: string }) {
  const h = hashString(source.id);
  const color = PALETTE[h % PALETTE.length];
  const Icon = SOURCE_ICONS[source.sourceType];
  const angle = 120 + (h % 90);
  return (
    <div className="cover" style={{ ['--cover-color' as string]: color, ['--cover-angle' as string]: `${angle}deg` }} aria-hidden="true">
      {thumbUrl ? <img src={thumbUrl} alt="" className="cover-img" /> : (
        <>
          <span className="cover-lines" />
          <Icon size={30} className="cover-icon" />
          <span className="cover-title">{source.title}</span>
        </>
      )}
    </div>
  );
}
