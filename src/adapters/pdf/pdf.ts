import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AppError } from '../../domain/errors';
import { paragraphsFromPdfLines, type PdfLine, type SegmentDraft } from '../../services/import/segment';

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

/** pdf.js yalnızca gerektiğinde yüklenir; ayrıştırma kendi Web Worker'ında çalışır (UI kilitlenmez). */
async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [lib, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    })();
  }
  return pdfjsPromise;
}

export type PasswordRequest = (reason: 'need' | 'incorrect') => Promise<string | null>;

export interface PdfOpenOptions {
  requestPassword?: PasswordRequest;
}

export async function openPdf(data: Uint8Array, opts: PdfOpenOptions = {}): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  // pdf.js veriyi worker'a aktarır; orijinal tamponu korumak için kopya verilir.
  const task = pdfjs.getDocument({
    data: data.slice(),
    isEvalSupported: false,
    enableXfa: false,
    stopAtErrors: false,
  });
  let cancelled = false;
  task.onPassword = (update: (pw: string) => void, reason: number) => {
    const ask = opts.requestPassword;
    if (!ask) {
      cancelled = true;
      void task.destroy();
      return;
    }
    // Parola yalnızca bu çağrı süresince bellekte tutulur; loglanmaz, saklanmaz.
    void ask(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? 'incorrect' : 'need').then((pw) => {
      if (pw == null) {
        cancelled = true;
        void task.destroy();
      } else {
        update(pw);
      }
    });
  };
  try {
    return await task.promise;
  } catch (e) {
    if (cancelled) throw new AppError('SRC-002', 'password-cancelled');
    const name = e instanceof Error ? e.name : 'unknown';
    throw new AppError('SRC-002', name);
  }
}

export interface PdfExtractResult {
  drafts: SegmentDraft[];
  pageCount: number;
  emptyPages: number;
}

interface TextItemLike {
  str: string;
  transform: number[];
  height: number;
  hasEOL?: boolean;
}

/** Sayfa sayfa metin çıkarır; sayfa numarası ve ofsetler korunur. İptal ve ilerleme desteklenir. */
export async function extractPdfText(
  doc: PDFDocumentProxy,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<PdfExtractResult> {
  const drafts: SegmentDraft[] = [];
  let offset = 0;
  let emptyPages = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    if (signal?.aborted) throw new AppError('SRC-006');
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const lines: PdfLine[] = [];
    let cur: { text: string; y: number; height: number } | null = null;
    for (const raw of content.items) {
      if (!('str' in raw)) continue;
      const item = raw as TextItemLike;
      const h = Math.abs(item.height || item.transform[3] || 10);
      const top = viewport.height - item.transform[5] - h;
      if (cur && Math.abs(top - cur.y) > h * 0.5) {
        lines.push(cur);
        cur = null;
      }
      if (!cur) cur = { text: '', y: top, height: h };
      cur.text += item.str;
      cur.height = Math.max(cur.height, h);
      if (item.hasEOL) {
        lines.push(cur);
        cur = null;
      }
    }
    if (cur) lines.push(cur);
    const pageDrafts = paragraphsFromPdfLines(lines, p, offset);
    if (pageDrafts.length === 0) emptyPages++;
    for (const d of pageDrafts) drafts.push(d);
    offset = pageDrafts.length ? pageDrafts[pageDrafts.length - 1].endOffset + 1 : offset + 1;
    page.cleanup();
    onProgress?.(p / doc.numPages);
  }
  return { drafts, pageCount: doc.numPages, emptyPages };
}

/** Okuma alanının "Orijinal sayfa" görünümü için tek sayfayı tuvale çizer. */
export async function renderPdfPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): Promise<void> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = cssWidth / base.width;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
}
