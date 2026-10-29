import type { SegmentDraft } from './import/segment';
import { AppError } from '../domain/errors';
import { getSourceFile } from './sources';
import type { Source } from '../domain/types';

/**
 * Yerel OCR (Tesseract, WebAssembly). Tüm dosyalar uygulamayla gelir (public/ocr); ağ kullanılmaz.
 * Taranmış PDF sayfaları ve görseller için çalışır; sonuç "OCR metni" olarak işaretlenir.
 */

export type OcrLang = 'tur' | 'eng' | 'tur+eng';

/** Tanınan metni boş satırlara göre paragraflara ayırır; satır sonu tirelemelerini birleştirir. */
export function ocrTextToDrafts(text: string, pageNumber: number | undefined, startOffset: number, confidence: number): SegmentDraft[] {
  const drafts: SegmentDraft[] = [];
  let offset = startOffset;
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const joined = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .reduce((acc, line) => (!acc ? line : /[\p{L}]-$/u.test(acc) && /^\p{Ll}/u.test(line) ? acc.slice(0, -1) + line : `${acc} ${line}`), '');
    if (joined.replace(/[^\p{L}\p{N}]/gu, '').length < 2) continue;
    drafts.push({
      segmentType: 'paragraph',
      text: joined,
      ...(pageNumber != null ? { pageNumber } : {}),
      startOffset: offset,
      endOffset: offset + joined.length,
      headingPath: [],
      extractionMethod: 'ocr',
      confidence: Math.round(confidence),
    });
    offset += joined.length + 1;
  }
  return drafts;
}

export interface OcrResult {
  drafts: SegmentDraft[];
  confidence: number;
  pages: number;
}

type TesseractWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;

async function makeWorker(lang: OcrLang, onLog?: (p: number) => void): Promise<TesseractWorker> {
  const { createWorker, OEM } = await import('tesseract.js');
  const base = new URL('ocr/', document.baseURI).href;
  return createWorker(lang.split('+'), OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}tesseract-core-simd-lstm.wasm.js`,
    langPath: base.replace(/\/$/, ''),
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onLog?.(m.progress);
    },
  });
}

export async function runOcr(
  source: Source,
  opts: { lang: OcrLang; onProgress?: (fraction: number) => void; signal?: AbortSignal },
): Promise<OcrResult> {
  const blob = await getSourceFile(source);
  if (!blob) throw new AppError('DB-004', 'files');
  let page = 0;
  let pages = 1;
  const worker = await makeWorker(opts.lang, (p) => opts.onProgress?.((page + p) / pages));
  const abort = () => void worker.terminate();
  opts.signal?.addEventListener('abort', abort);
  try {
    const drafts: SegmentDraft[] = [];
    let confSum = 0;
    if (source.sourceType === 'image') {
      const { data } = await worker.recognize(blob);
      drafts.push(...ocrTextToDrafts(data.text, undefined, 0, data.confidence));
      confSum = data.confidence;
    } else if (source.sourceType === 'pdf') {
      const { openPdf } = await import('../adapters/pdf/pdf');
      const doc = await openPdf(new Uint8Array(await blob.arrayBuffer()));
      pages = doc.numPages;
      let offset = 0;
      try {
        for (page = 0; page < pages; page++) {
          if (opts.signal?.aborted) throw new AppError('SRC-006');
          const p = await doc.getPage(page + 1);
          const viewport = p.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new AppError('UNK-000', 'canvas');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await p.render({ canvasContext: ctx, viewport }).promise;
          p.cleanup();
          const { data } = await worker.recognize(canvas);
          const d = ocrTextToDrafts(data.text, page + 1, offset, data.confidence);
          drafts.push(...d);
          if (d.length) offset = d[d.length - 1].endOffset + 1;
          confSum += data.confidence;
          canvas.width = 0;
          opts.onProgress?.((page + 1) / pages);
        }
      } finally {
        void doc.destroy();
      }
    } else {
      throw new AppError('SRC-001', 'ocr-type');
    }
    return { drafts, confidence: confSum / pages, pages };
  } catch (e) {
    if (opts.signal?.aborted) throw new AppError('SRC-006');
    throw e;
  } finally {
    opts.signal?.removeEventListener('abort', abort);
    await worker.terminate().catch(() => undefined);
  }
}
