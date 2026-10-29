import { strFromU8, unzipSync } from 'fflate';
import { AppError } from '../../domain/errors';
import type { SegmentType } from '../../domain/types';
import type { SegmentDraft } from './segment';

/**
 * EPUB içe aktarma: XHTML asla HTML olarak işlenmez; etiketler ayıklanıp düz metin segmentlere dönüştürülür.
 * Betikler, stiller ve görseller yok sayılır. DRM'li (şifreli) EPUB'lar reddedilir.
 */

const MAX_ENTRY = 60 * 1024 * 1024;
const MAX_TOTAL = 400 * 1024 * 1024;

/** EPUB standardı: ilk ZIP girdisi sıkıştırılmamış "mimetype" ve içeriği "application/epub+zip". */
export function looksLikeEpub(b: Uint8Array): boolean {
  if (b.length < 58 || b[0] !== 0x50 || b[1] !== 0x4b || b[2] !== 0x03 || b[3] !== 0x04) return false;
  const nameLen = b[26] | (b[27] << 8);
  const extraLen = b[28] | (b[29] << 8);
  const name = new TextDecoder().decode(b.subarray(30, 30 + nameLen));
  if (name !== 'mimetype') return false;
  const start = 30 + nameLen + extraLen;
  return new TextDecoder().decode(b.subarray(start, start + 20)) === 'application/epub+zip';
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', deg: '°', middot: '·', bull: '•', times: '×' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3]) : undefined;
}

interface Block {
  type: SegmentType;
  level?: number;
  text: string;
}

/** XHTML gövdesinden blok düzeyinde düz metin çıkarır (bağımlılıksız, DOM gerektirmez). */
export function xhtmlToBlocks(xhtml: string): Block[] {
  let body = xhtml.replace(/<!--[\s\S]*?-->/g, '');
  const b = body.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (b) body = b[1];
  body = body
    .replace(/<(script|style|svg|math|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<rt[^>]*>[\s\S]*?<\/rt>/gi, '');
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let listDepth = 0;
  let preDepth = 0;
  const flush = () => {
    if (cur) {
      const text = cur.type === 'code' ? cur.text.replace(/\s+$/, '') : cur.text.replace(/[ \t\r\n\f]+/g, ' ').trim();
      if (text) blocks.push({ ...cur, text: decodeEntities(text) });
    }
    cur = null;
  };
  const start = (type: SegmentType, level?: number) => {
    flush();
    cur = { type, level, text: '' };
  };
  const re = /<\/?([a-z0-9:]+)\b[^>]*>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[2] != null) {
      if (!cur) cur = { type: listDepth ? 'list' : 'paragraph', text: '' };
      cur.text += preDepth ? m[2] : m[2];
      continue;
    }
    const tag = m[1].toLowerCase().replace(/^.*:/, '');
    const closing = m[0][1] === '/';
    if (/^h[1-6]$/.test(tag)) {
      if (closing) flush();
      else start('heading', Number(tag[1]));
    } else if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'figcaption' || tag === 'dt' || tag === 'dd' || tag === 'tr') {
      if (!closing && listDepth === 0) start('paragraph');
      else if (closing && listDepth === 0) flush();
    } else if (tag === 'blockquote') {
      if (closing) flush();
      else start('quote');
    } else if (tag === 'pre') {
      if (closing) {
        preDepth = Math.max(0, preDepth - 1);
        flush();
      } else {
        preDepth++;
        start('code');
      }
    } else if (tag === 'ul' || tag === 'ol') {
      if (closing) {
        listDepth = Math.max(0, listDepth - 1);
        if (listDepth === 0) flush();
      } else {
        if (listDepth === 0) start('list');
        listDepth++;
      }
    } else if (tag === 'li') {
      if (!closing) {
        if (!cur || (cur as Block).type !== 'list') start('list');
        const c = cur as unknown as Block;
        c.text += c.text ? '\n• ' : '• ';
      }
    } else if (tag === 'br') {
      if (cur) (cur as Block).text += (cur as Block).type === 'list' || (cur as Block).type === 'code' ? '\n' : ' ';
    } else if (tag === 'td' || tag === 'th') {
      if (cur && !closing) (cur as Block).text += ' ';
    }
  }
  flush();
  // Listelerde satır sonlarını koru (flush boşlukları birleştirdiği için yeniden kur).
  return blocks.map((bl) => (bl.type === 'list' ? { ...bl, text: bl.text.replace(/ ?• /g, '\n• ').trim() } : bl));
}

function resolvePath(base: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]);
  const parts = (base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '').concat(clean).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

export interface EpubResult {
  title?: string;
  author?: string;
  drafts: SegmentDraft[];
  chapters: number;
}

export function parseEpub(bytes: Uint8Array): EpubResult {
  let total = 0;
  let tooBig = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(f) {
        total += f.originalSize;
        if (f.originalSize > MAX_ENTRY || total > MAX_TOTAL) {
          tooBig = true;
          return false;
        }
        // Yalnızca metin içerikleri açılır; görseller ve fontlar atlanır.
        return /\.(xml|opf|x?html?|ncx)$/i.test(f.name) || f.name === 'mimetype';
      },
    });
  } catch {
    throw new AppError('SRC-002', 'epub-zip');
  }
  if (tooBig) throw new AppError('SRC-004', 'epub');
  if (files['META-INF/encryption.xml']) {
    const enc = strFromU8(files['META-INF/encryption.xml']);
    // Yalnızca font karartması (obfuscation) varsa metin okunabilir; içerik şifrelemesi DRM'dir.
    if (/EncryptedData/i.test(enc) && !/(idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC)/i.test(enc)) throw new AppError('SRC-002', 'epub-drm');
  }
  const container = files['META-INF/container.xml'];
  if (!container) throw new AppError('SRC-002', 'epub-container');
  const rootTag = strFromU8(container).match(/<rootfile\b[^>]*>/i)?.[0];
  const opfPath = rootTag ? attr(rootTag, 'full-path') : undefined;
  if (!opfPath || !files[opfPath]) throw new AppError('SRC-002', 'epub-opf');
  const opf = strFromU8(files[opfPath]);
  const title = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1];
  const author = opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)?.[1];
  const manifest = new Map<string, { href: string; type: string }>();
  for (const tag of opf.match(/<item\b[^>]*>/gi) ?? []) {
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    if (id && href) manifest.set(id, { href, type: attr(tag, 'media-type') ?? '' });
  }
  const spine = (opf.match(/<itemref\b[^>]*>/gi) ?? []).map((t) => attr(t, 'idref')).filter((x): x is string => Boolean(x));
  const drafts: SegmentDraft[] = [];
  let offset = 0;
  let chapters = 0;
  const headingStack: { level: number; text: string }[] = [];
  for (const idref of spine) {
    const item = manifest.get(idref);
    if (!item || !/x?html/i.test(item.type + item.href)) continue;
    const path = resolvePath(opfPath, item.href);
    const file = files[path];
    if (!file) continue;
    const blocks = xhtmlToBlocks(strFromU8(file));
    if (!blocks.length) continue;
    chapters++;
    for (const bl of blocks) {
      if (bl.type === 'heading') {
        const level = bl.level ?? 1;
        while (headingStack.length && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
      }
      drafts.push({
        segmentType: bl.type,
        ...(bl.type === 'heading' ? { level: bl.level } : {}),
        text: bl.text,
        startOffset: offset,
        endOffset: offset + bl.text.length,
        headingPath: headingStack.map((h) => h.text),
        extractionMethod: 'text',
      });
      if (bl.type === 'heading') headingStack.push({ level: bl.level ?? 1, text: bl.text });
      offset += bl.text.length + 1;
    }
  }
  return { title: title ? decodeEntities(title.replace(/<[^>]+>/g, '')).trim() : undefined, author: author ? decodeEntities(author.replace(/<[^>]+>/g, '')).trim() : undefined, drafts, chapters };
}
