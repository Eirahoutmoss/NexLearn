import { newId } from '../../domain/ids';
import { makeLocator } from '../../domain/locator';
import type { ExtractionMethod, SegmentType, SourceSegment } from '../../domain/types';

/** Segment taslağı (kimlik ve kaynak kimliği sonra atanır). */
export interface SegmentDraft {
  segmentType: SegmentType;
  level?: number;
  text: string;
  pageNumber?: number;
  startOffset: number;
  endOffset: number;
  headingPath: string[];
  extractionMethod: ExtractionMethod;
  /** OCR güveni (0-100), yalnızca OCR segmentlerinde. */
  confidence?: number;
}

export function finalizeSegments(sourceId: string, drafts: SegmentDraft[], isSample?: boolean): SourceSegment[] {
  return drafts.map((d, index) => ({
    id: newId('seg'),
    sourceId,
    index,
    ...d,
    locator: makeLocator(d),
    ...(isSample ? { isSample: true } : {}),
  }));
}

/** Satır sonlarını normalleştirir (CRLF → LF). Ofsetler normalleştirilmiş metne göredir. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
}

/** Düz metni boş satırlarla paragraflara böler. */
export function segmentPlainText(raw: string, method: ExtractionMethod = 'text'): SegmentDraft[] {
  const text = normalizeNewlines(raw);
  const drafts: SegmentDraft[] = [];
  const re = /[^\n]+(?:\n(?![ \t]*\n)[^\n]*)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const block = m[0];
    const trimmed = block.replace(/[ \t]+\n/g, '\n').trim();
    if (!trimmed) continue;
    drafts.push({
      segmentType: 'paragraph',
      text: trimmed.replace(/\s*\n\s*/g, ' '),
      startOffset: m.index,
      endOffset: m.index + block.length,
      headingPath: [],
      extractionMethod: method,
    });
  }
  return drafts;
}

/** Satır içi Markdown işaretlerini metinden temizler. HTML asla yorumlanmaz; etiketler düz metin kalır. */
export function stripInlineMarkdown(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1')
    .replace(/(?<![\w_])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, '$1');
}

/**
 * Markdown'ı yapısal segmentlere ayırır: başlık, paragraf, liste, alıntı, kod.
 * Başlık yolu (headingPath) korunur; konumlar orijinal metindeki ofsetlerdir.
 */
export function segmentMarkdown(raw: string): SegmentDraft[] {
  const text = normalizeNewlines(raw);
  const lines = text.split('\n');
  const drafts: SegmentDraft[] = [];
  const headingStack: { level: number; text: string }[] = [];
  const path = () => headingStack.map((h) => h.text);

  let offset = 0;
  const lineOffsets = lines.map((l) => {
    const o = offset;
    offset += l.length + 1;
    return o;
  });

  let i = 0;
  const push = (type: SegmentType, body: string, startLine: number, endLine: number, level?: number) => {
    const clean = type === 'code' ? body.replace(/\s+$/, '') : stripInlineMarkdown(body).trim();
    if (!clean) return;
    drafts.push({
      segmentType: type,
      ...(level ? { level } : {}),
      text: clean,
      startOffset: lineOffsets[startLine],
      endOffset: lineOffsets[endLine] + lines[endLine].length,
      headingPath: path(),
      extractionMethod: 'markdown',
    });
  };

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      const start = i;
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      const end = Math.min(i, lines.length - 1);
      i++;
      push('code', body.join('\n'), start, end);
      continue;
    }
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      const label = stripInlineMarkdown(h[2]).trim();
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
      // Başlığın kendi yolu üst başlıkları içerir; ardından yığına eklenir.
      push('heading', h[2], i, i, level);
      headingStack.push({ level, text: label });
      i++;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      i++;
      continue; // yatay çizgi
    }
    if (/^\s{0,3}>/.test(line)) {
      const start = i;
      const body: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      push('quote', body.join(' '), start, i - 1);
      continue;
    }
    if (/^\s*([-*+]|\d{1,3}[.)])\s+/.test(line)) {
      const start = i;
      const items: string[] = [];
      while (i < lines.length && !/^\s*$/.test(lines[i])) {
        const item = lines[i].match(/^\s*([-*+]|\d{1,3}[.)])\s+(.*)$/);
        if (item) items.push(`• ${item[2]}`);
        else if (items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      push('list', items.map(stripInlineMarkdown).join('\n'), start, i - 1);
      continue;
    }
    const start = i;
    const body: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s{0,3}(#{1,6}\s|>|```|~~~)/.test(lines[i]) &&
      !(i > start && /^\s*([-*+]|\d{1,3}[.)])\s+/.test(lines[i]))
    ) {
      body.push(lines[i++].trim());
    }
    push('paragraph', body.join(' '), start, i - 1);
  }
  return drafts;
}

/** PDF metin öğelerinden oluşturulmuş satır. */
export interface PdfLine {
  text: string;
  /** Sayfa üstünden aşağı doğru artan dikey konum. */
  y: number;
  height: number;
}

/**
 * Bir sayfanın satırlarını dikey boşluklara göre paragraflara ayırır.
 * Satır yüksekliğinin ~1.6 katından büyük boşluk yeni paragraf sayılır.
 */
export function paragraphsFromPdfLines(lines: PdfLine[], pageNumber: number, pageStartOffset: number): SegmentDraft[] {
  const drafts: SegmentDraft[] = [];
  let current: string[] = [];
  let prev: PdfLine | null = null;
  let offset = pageStartOffset;
  let startOffset = offset;

  const flush = () => {
    const joined = joinPdfLines(current);
    if (joined.trim()) {
      drafts.push({
        segmentType: 'paragraph',
        text: joined.trim(),
        pageNumber,
        startOffset,
        endOffset: offset,
        headingPath: [],
        extractionMethod: 'pdf-text',
      });
    }
    current = [];
    startOffset = offset;
  };

  for (const line of lines) {
    const t = line.text.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (prev) {
      const gap = line.y - (prev.y + prev.height);
      const lh = Math.max(prev.height, line.height, 1);
      if (gap > lh * 0.6 || line.y < prev.y) flush();
    }
    current.push(t);
    offset += t.length + 1;
    prev = line;
  }
  flush();
  return drafts;
}

/** Satır sonu tirelemesini birleştirir ("bilgi-\nsayar" → "bilgisayar"). */
export function joinPdfLines(lines: string[]): string {
  let out = '';
  for (const l of lines) {
    if (!out) out = l;
    else if (/[\p{L}]-$/u.test(out) && /^[\p{Ll}]/u.test(l)) out = out.slice(0, -1) + l;
    else out += ` ${l}`;
  }
  return out;
}
