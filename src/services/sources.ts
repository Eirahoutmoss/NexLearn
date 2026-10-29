import { emitChange, getDb } from '../adapters/storage/db';
import { buildEntity, getEntity, listDeleted, listLive, updateEntity } from '../adapters/storage/repo';
import { AppError, toAppError } from '../domain/errors';
import { contentHash } from '../domain/hash';
import { newId, nowIso } from '../domain/ids';
import { countWords, isMeaningless, titleFromFilename } from '../domain/text';
import type { ProcessingStatus, Source, SourceSegment, SourceType } from '../domain/types';
import { checkSize, decodeText, detectKind, extractTextDrafts } from './import/importers';
import { finalizeSegments, type SegmentDraft } from './import/segment';
import type { PasswordRequest } from '../adapters/pdf/pdf';

export interface ImportOptions {
  onProgress?: (fraction: number, phase: 'reading' | 'extracting' | 'saving') => void;
  signal?: AbortSignal;
  requestPassword?: PasswordRequest;
  /** Aynı içerik zaten varsa sorulur; false dönerse içe aktarma durur. Otomatik silme yapılmaz. */
  confirmDuplicate?: (existing: Source) => Promise<boolean>;
  isSample?: boolean;
}

export type ImportResult =
  | { status: 'imported'; source: Source }
  | { status: 'skipped-duplicate'; existing: Source };

interface Extracted {
  drafts: SegmentDraft[];
  status: ProcessingStatus;
  errorCode?: string;
  pageCount?: number;
  metadata: Source['metadata'];
  /** Biçimin kendi başlığı (ör. EPUB dc:title); varsa dosya adından türetilen başlığın yerine geçer. */
  title?: string;
}

async function extract(
  kind: SourceType,
  bytes: Uint8Array,
  opts: ImportOptions,
  title: string,
): Promise<Extracted> {
  if (kind === 'image') {
    // Görseller kaynak olarak saklanır; metin isteğe bağlı OCR ile sonradan çıkarılır (services/ocr.ts). Not ve kart bağlanabilmesi için
    // görselin başlığı tek bir "kullanıcı" segmenti (altyazı) olarak tutulur; bu çıkarılmış metin değildir.
    return {
      drafts: [{ segmentType: 'paragraph', text: title, startOffset: 0, endOffset: title.length, headingPath: [], extractionMethod: 'user' }],
      status: 'ready',
      metadata: { ocr: false },
    };
  }
  if (kind === 'epub') {
    const { parseEpub } = await import('./import/epub');
    const res = parseEpub(bytes);
    const text = res.drafts.map((d) => d.text).join(' ');
    if (!res.drafts.length || isMeaningless(text)) return { drafts: [], status: 'empty', errorCode: 'SRC-007', metadata: { chapters: res.chapters } };
    return { drafts: res.drafts, status: 'ready', title: res.title, metadata: { chapters: res.chapters, author: res.author ?? null } };
  }
  if (kind === 'pdf') {
    const { openPdf, extractPdfText } = await import('../adapters/pdf/pdf');
    const doc = await openPdf(bytes, { requestPassword: opts.requestPassword });
    try {
      const res = await extractPdfText(doc, (f) => opts.onProgress?.(f, 'extracting'), opts.signal);
      const text = res.drafts.map((d) => d.text).join(' ');
      if (res.drafts.length === 0 || isMeaningless(text)) {
        return { drafts: [], status: 'empty', errorCode: 'SRC-003', pageCount: res.pageCount, metadata: { emptyPages: res.emptyPages } };
      }
      return {
        drafts: res.drafts,
        status: 'ready',
        pageCount: res.pageCount,
        metadata: { emptyPages: res.emptyPages },
      };
    } finally {
      void doc.destroy();
    }
  }
  const { text, encoding } = decodeText(bytes);
  const drafts = extractTextDrafts(kind as 'txt' | 'markdown', text);
  if (drafts.length === 0 || isMeaningless(text)) {
    return { drafts: [], status: 'empty', errorCode: 'SRC-007', metadata: { encoding } };
  }
  return { drafts, status: 'ready', metadata: { encoding } };
}

async function findByHash(hash: string): Promise<Source | undefined> {
  return (await listLive('sources')).find((s) => s.contentHash === hash);
}

/** Dosyayı yerel olarak kaydeder ve metnini çıkarır. Orijinal dosya değiştirilmeden saklanır. */
export async function importFile(file: File | { name: string; bytes: Uint8Array }, opts: ImportOptions = {}): Promise<ImportResult> {
  opts.onProgress?.(0, 'reading');
  const bytes = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : file.bytes;
  const name = file.name;
  const kind = detectKind(name, bytes);
  checkSize(kind.sourceType, bytes.byteLength);
  if (opts.signal?.aborted) throw new AppError('SRC-006');

  const hash = await contentHash(bytes);
  const existing = await findByHash(hash);
  if (existing) {
    const proceed = opts.confirmDuplicate ? await opts.confirmDuplicate(existing) : false;
    if (!proceed) return { status: 'skipped-duplicate', existing };
  }

  const db = await getDb();
  const fileId = newId('file');
  const source = buildEntity('sources', {
    title: titleFromFilename(name),
    sourceType: kind.sourceType,
    originalFilename: (name.split(/[\\/]/).pop() ?? name).slice(0, 255),
    mimeType: kind.mimeType,
    sizeBytes: bytes.byteLength,
    contentHash: hash,
    processingStatus: 'processing',
    wordCount: 0,
    segmentCount: 0,
    tags: [],
    storageRef: fileId,
    metadata: {},
    ...(opts.isSample ? { isSample: true } : {}),
  });
  // Önce kaynak + orijinal dosya kaydedilir: çıkarım yarıda kalırsa kullanıcı yeniden deneyebilir.
  const tx = db.transaction(['sources', 'files'], 'readwrite');
  await tx.objectStore('sources').add(source);
  await tx.objectStore('files').add({
    id: fileId,
    sourceId: source.id,
    blob: new Blob([bytes as BlobPart], { type: kind.mimeType }),
    mimeType: kind.mimeType,
    sizeBytes: bytes.byteLength,
    ...(opts.isSample ? { isSample: true } : {}),
  });
  await tx.done;
  emitChange(['sources', 'files']);

  const saved = await runExtraction(source, bytes, opts);
  return { status: 'imported', source: saved };
}

async function runExtraction(source: Source, bytes: Uint8Array, opts: ImportOptions): Promise<Source> {
  let result: Extracted;
  try {
    result = await extract(source.sourceType, bytes, opts, source.title);
  } catch (e) {
    const err = toAppError(e);
    const status: ProcessingStatus = err.code === 'SRC-006' ? 'partial' : 'failed';
    await updateEntity('sources', source.id, { processingStatus: status, errorCode: err.code });
    throw err;
  }
  opts.onProgress?.(1, 'saving');
  return saveSegments(source.id, result, opts.isSample);
}

async function saveSegments(sourceId: string, result: Extracted, isSample?: boolean): Promise<Source> {
  const segments = finalizeSegments(sourceId, result.drafts, isSample);
  const db = await getDb();
  const tx = db.transaction(['sources', 'segments'], 'readwrite');
  const segStore = tx.objectStore('segments');
  // Yeniden denemede/not düzenlemede eski segmentler temizlenir; metni aynı kalan segmentler
  // kimliğini korur, böylece onlara bağlı vurgu ve kart bağlantıları kopmaz.
  const reusable = new Map<string, string[]>();
  let cursor = await segStore.index('sourceId').openCursor(sourceId);
  while (cursor) {
    const list = reusable.get(cursor.value.text) ?? [];
    list.push(cursor.value.id);
    reusable.set(cursor.value.text, list);
    await cursor.delete();
    cursor = await cursor.continue();
  }
  for (const s of segments) {
    const ids = reusable.get(s.text);
    if (ids?.length) s.id = ids.shift()!;
  }
  for (const s of segments) await segStore.add(s);
  const srcStore = tx.objectStore('sources');
  const current = await srcStore.get(sourceId);
  if (!current) {
    tx.done.catch(() => undefined);
    tx.abort();
    throw new AppError('DB-004', 'sources');
  }
  const next: Source = {
    ...current,
    ...(result.title ? { title: result.title.slice(0, 200) } : {}),
    processingStatus: result.status,
    errorCode: result.errorCode,
    pageCount: result.pageCount,
    wordCount: segments.reduce((n, s) => n + countWords(s.text), 0),
    segmentCount: segments.length,
    metadata: { ...current.metadata, ...result.metadata },
    updatedAt: nowIso(),
    revision: current.revision + 1,
  };
  await srcStore.put(next);
  await tx.done;
  emitChange(['sources', 'segments']);
  return next;
}

/** Yarım kalan veya başarısız içe aktarmayı saklanan orijinal dosyadan yeniden çalıştırır. */
export async function retryImport(sourceId: string, opts: ImportOptions = {}): Promise<Source> {
  const source = await getEntity('sources', sourceId);
  if (!source?.storageRef) throw new AppError('DB-004', 'sources');
  const db = await getDb();
  const file = await db.get('files', source.storageRef);
  if (!file) throw new AppError('DB-004', 'files');
  await updateEntity('sources', sourceId, { processingStatus: 'processing', errorCode: undefined });
  const bytes = new Uint8Array(await file.blob.arrayBuffer());
  return runExtraction(source, bytes, opts);
}

/** Uygulama içe aktarma sırasında kapandıysa "işleniyor" durumunda kalan kaynakları "kısmi" olarak işaretler. */
export async function recoverInterruptedImports(): Promise<number> {
  const stale = (await listLive('sources')).filter((s) => s.processingStatus === 'processing' || s.processingStatus === 'pending');
  for (const s of stale) await updateEntity('sources', s.id, { processingStatus: 'partial', errorCode: 'SRC-006' });
  return stale.length;
}

/** Kullanıcının doğrudan yazdığı not ya da yapıştırdığı metinden kaynak oluşturur. */
export async function createTextSource(
  kind: 'note' | 'paste',
  title: string,
  text: string,
  opts: { isSample?: boolean; sourceType?: SourceType } = {},
): Promise<Source> {
  const trimmed = text.trim();
  if (!trimmed) throw new AppError('VAL-001', 'text');
  const bytes = new TextEncoder().encode(trimmed);
  const hash = await contentHash(bytes);
  const sourceType = opts.sourceType ?? kind;
  const source = buildEntity('sources', {
    title: title.trim().slice(0, 200) || 'Adsız not',
    sourceType,
    mimeType: 'text/markdown',
    sizeBytes: bytes.byteLength,
    contentHash: hash,
    processingStatus: 'processing',
    wordCount: 0,
    segmentCount: 0,
    tags: [],
    metadata: { body: trimmed },
    ...(opts.isSample ? { isSample: true } : {}),
  });
  const db = await getDb();
  await db.add('sources', source);
  const drafts = extractTextDrafts(sourceType === 'markdown' ? 'markdown' : kind, trimmed);
  return saveSegments(source.id, { drafts, status: drafts.length ? 'ready' : 'empty', errorCode: drafts.length ? undefined : 'SRC-007', metadata: {} }, opts.isSample);
}

/** Not kaynağının metnini günceller ve segmentleri yeniden üretir. Vurgular segment kimliği değiştiği için korunmaz; not kaynaklarında uyarı gösterilir. */
export async function updateNoteBody(sourceId: string, title: string, text: string): Promise<Source> {
  const trimmed = text.trim();
  if (!trimmed) throw new AppError('VAL-001', 'text');
  const bytes = new TextEncoder().encode(trimmed);
  const src = await updateEntity('sources', sourceId, {
    title: title.trim().slice(0, 200) || 'Adsız not',
    contentHash: await contentHash(bytes),
    sizeBytes: bytes.byteLength,
    metadata: { body: trimmed },
  });
  return saveSegments(sourceId, { drafts: extractTextDrafts('note', trimmed), status: 'ready', metadata: src.metadata });
}

export const listSources = () => listLive('sources');
export const listDeletedSources = () => listDeleted('sources');
export const getSource = (id: string) => getEntity('sources', id);

export async function getSegments(sourceId: string): Promise<SourceSegment[]> {
  const db = await getDb();
  const segs = await db.getAllFromIndex('segments', 'sourceId', sourceId);
  return segs.sort((a, b) => a.index - b.index);
}

export async function getAllSegments(): Promise<SourceSegment[]> {
  const db = await getDb();
  return db.getAll('segments');
}

export async function getSourceFile(source: Source): Promise<Blob | undefined> {
  if (!source.storageRef) return undefined;
  const db = await getDb();
  return (await db.get('files', source.storageRef))?.blob;
}

export async function renameSource(id: string, title: string): Promise<void> {
  const t = title.trim();
  if (!t) throw new AppError('VAL-001', 'title');
  await updateEntity('sources', id, { title: t.slice(0, 200) });
}

export async function setSourceTags(id: string, tags: string[]): Promise<void> {
  const clean = [...new Set(tags.map((t) => t.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 30);
  await updateEntity('sources', id, { tags: clean });
}

/** Çöp kutusuna taşır (yumuşak silme). Notlar ve kartlar korunur. */
export async function trashSource(id: string): Promise<void> {
  await updateEntity('sources', id, { deletedAt: nowIso() });
}

export async function restoreSource(id: string): Promise<void> {
  await updateEntity('sources', id, { deletedAt: null });
}

/**
 * Kalıcı silme (ayrı ve onaylı işlem): kaynak, segmentler, dosya, vurgular ve okuma durumu silinir.
 * Kartlar ve kavramlar korunur; kaynak bağlantıları "kopuk" olarak gösterilir.
 */
export async function purgeSource(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['sources', 'segments', 'files', 'annotations', 'readingStates'], 'readwrite');
  await tx.objectStore('sources').delete(id);
  for (const store of ['segments', 'files', 'annotations'] as const) {
    const idx = tx.objectStore(store).index('sourceId');
    let c = await idx.openCursor(id);
    while (c) {
      await c.delete();
      c = await c.continue();
    }
  }
  await tx.objectStore('readingStates').delete(id);
  await tx.done;
  emitChange(['sources', 'segments', 'files', 'annotations', 'readingStates']);
}

/**
 * OCR sonucunu kaynağa uygular: segmentler `extractionMethod: 'ocr'` ile yazılır (normal çıkarımdan ayırt edilir).
 * Görsellerde altyazı segmenti korunur.
 */
export async function applyOcrResult(sourceId: string, drafts: SegmentDraft[], meta: { confidence: number; pages: number; langs: string }): Promise<Source> {
  const source = await getEntity('sources', sourceId);
  if (!source) throw new AppError('DB-004', 'sources');
  const existing = await getSegments(sourceId);
  const keep = source.sourceType === 'image' ? existing.filter((s) => s.extractionMethod === 'user').map((s) => ({
    segmentType: s.segmentType, text: s.text, startOffset: s.startOffset, endOffset: s.endOffset, headingPath: s.headingPath, extractionMethod: s.extractionMethod,
  })) : [];
  const all = [...keep, ...drafts];
  const text = drafts.map((d) => d.text).join(' ');
  const ok = drafts.length > 0 && !isMeaningless(text);
  return saveSegments(sourceId, {
    drafts: ok ? all : keep,
    status: ok ? 'ready' : source.sourceType === 'image' ? 'ready' : 'empty',
    errorCode: ok ? undefined : source.sourceType === 'image' ? undefined : 'SRC-003',
    pageCount: source.pageCount,
    metadata: { ocr: ok, ocrConfidence: Math.round(meta.confidence), ocrLangs: meta.langs, ocrPages: meta.pages },
  }, source.isSample);
}
