import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { DATA_SCHEMA_VERSION, DATA_STORES, emitChange, getDb, type Snapshot } from '../../adapters/storage/db';
import { AppError } from '../../domain/errors';
import { sha256Hex } from '../../domain/hash';
import { newId, nowIso } from '../../domain/ids';
import type {
  Annotation,
  ApplicationTask,
  Concept,
  ConceptRelation,
  FileRecord,
  LearningItem,
  LearningSession,
  ReadingState,
  ReviewEvent,
  ReviewState,
  Settings,
  Source,
  SourceSegment,
} from '../../domain/types';
import { sanitizeSettings } from '../settings';
import { decryptBytes, encryptBytes, isEncryptedBackup } from './crypto';
import { checkCompatibility, parseSemVer, validateRecords, type RecordKind } from './validate';

export interface BackupData {
  schemaVersion: string;
  appVersion: string;
  createdAt: string;
  sources: Source[];
  segments: SourceSegment[];
  annotations: Annotation[];
  concepts: Concept[];
  relations: ConceptRelation[];
  items: LearningItem[];
  reviewStates: ReviewState[];
  reviewEvents: ReviewEvent[];
  tasks: ApplicationTask[];
  sessions: LearningSession[];
  readingStates: ReadingState[];
  settings: Settings;
}

export interface OriginalFile {
  id: string;
  sourceId: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface ParsedBackup {
  data: BackupData;
  originals: OriginalFile[];
  format: 'zip' | 'json';
  encrypted: boolean;
  compatibility: 'same' | 'newer-minor' | 'migrate';
  warnings: { orphanSegments: number; orphanStates: number; orphanEvents: number };
}

/** Yedekteki dosya adları (önerilen paket biçimi). */
const DATA_FILES: Record<RecordKind, string> = {
  sources: 'data/sources.json',
  segments: 'data/segments.json',
  annotations: 'data/annotations.json',
  concepts: 'data/concepts.json',
  relations: 'data/relations.json',
  items: 'data/learning-items.json',
  reviewStates: 'data/review-states.json',
  reviewEvents: 'data/review-events.json',
  tasks: 'data/tasks.json',
  sessions: 'data/sessions.json',
  readingStates: 'data/reading-states.json',
};

const MAX_ENTRY_BYTES = 600 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** Tüm kullanıcı verisini (çöp kutusundakiler dahil) okur. */
export async function collectData(): Promise<BackupData> {
  const db = await getDb();
  const tx = db.transaction([...DATA_STORES, 'settings'], 'readonly');
  const get = <S extends (typeof DATA_STORES)[number]>(s: S) => tx.objectStore(s).getAll();
  const [sources, segments, annotations, concepts, relations, items, reviewStates, reviewEvents, tasks, sessions, readingStates, settingsRec] =
    await Promise.all([
      get('sources'),
      get('segments'),
      get('annotations'),
      get('concepts'),
      get('relations'),
      get('items'),
      get('reviewStates'),
      get('reviewEvents'),
      get('tasks'),
      get('sessions'),
      get('readingStates'),
      tx.objectStore('settings').get('app'),
    ]);
  await tx.done;
  const { id: _id, ...settings } = settingsRec ?? ({ id: 'app' } as Settings & { id: string });
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    appVersion: __APP_VERSION__,
    createdAt: nowIso(),
    sources,
    segments,
    annotations,
    concepts,
    relations,
    items,
    reviewStates,
    reviewEvents,
    tasks,
    sessions,
    readingStates,
    settings: sanitizeSettings(settings),
  };
}

export async function collectOriginals(): Promise<FileRecord[]> {
  const db = await getDb();
  return db.getAll('files');
}

export interface BackupScope {
  counts: Record<RecordKind, number>;
  originals: number;
  originalsBytes: number;
}

/** Yedek oluşturmadan önce kullanıcıya gösterilen kapsam. */
export async function backupScope(): Promise<BackupScope> {
  const [data, files] = await Promise.all([collectData(), collectOriginals()]);
  const counts = Object.fromEntries((Object.keys(DATA_FILES) as RecordKind[]).map((k) => [k, data[k].length])) as Record<RecordKind, number>;
  return { counts, originals: files.length, originalsBytes: files.reduce((n, f) => n + f.sizeBytes, 0) };
}

/** Yedek ZIP paketini üretir (manifest + veri + isteğe bağlı orijinaller + sağlama toplamları). */
export async function buildBackupZip(data: BackupData, originals: { id: string; sourceId: string; mimeType: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const [kind, path] of Object.entries(DATA_FILES) as [RecordKind, string][]) {
    files[path] = strToU8(JSON.stringify(data[kind]));
  }
  files['data/settings.json'] = strToU8(JSON.stringify(data.settings));
  const originalsIndex: { id: string; sourceId: string; mimeType: string; path: string }[] = [];
  for (const o of originals) {
    const path = `originals/${o.sourceId}.${MIME_EXT[o.mimeType] ?? 'bin'}`;
    files[path] = o.bytes;
    originalsIndex.push({ id: o.id, sourceId: o.sourceId, mimeType: o.mimeType, path });
  }
  const manifest = {
    format: 'nexlearn-backup',
    schemaVersion: data.schemaVersion,
    appVersion: data.appVersion,
    createdAt: data.createdAt,
    checksumAlgo: 'sha256',
    originals: originalsIndex,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const lines: string[] = [];
  for (const path of Object.keys(files).sort()) lines.push(`${await sha256Hex(files[path])}  ${path}`);
  files['checksums.sha256'] = strToU8(`${lines.join('\n')}\n`);
  const zippable: Zippable = {};
  for (const [path, bytes] of Object.entries(files)) {
    // Zaten sıkıştırılmış ikili dosyalar tekrar sıkıştırılmaz.
    zippable[path] = [bytes, { level: path.startsWith('originals/') ? 0 : 6 }];
  }
  return zipSync(zippable);
}

export async function createBackup(opts: { includeOriginals: boolean; password?: string }): Promise<{ bytes: Uint8Array; fileName: string }> {
  const data = await collectData();
  const originals = opts.includeOriginals
    ? await Promise.all(
        (await collectOriginals()).map(async (f) => ({ id: f.id, sourceId: f.sourceId, mimeType: f.mimeType, bytes: new Uint8Array(await f.blob.arrayBuffer()) })),
      )
    : [];
  let bytes = await buildBackupZip(data, originals);
  // Üretilen yedek hemen geri okunarak doğrulanır; doğrulanamayan yedek kullanıcıya verilmez.
  try {
    await parseBackupBytes(bytes);
  } catch {
    throw new AppError('EXP-001');
  }
  const stamp = data.createdAt.replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  if (opts.password) {
    bytes = await encryptBytes(bytes, opts.password);
    return { bytes, fileName: `nexlearn-backup-${stamp}.nexlearn-enc` };
  }
  return { bytes, fileName: `nexlearn-backup-${stamp}.zip` };
}

/** Tek dosyalık JSON dışa aktarma (örnek şeması; segmentler kaynakların içinde). */
export function toExportJson(data: BackupData): string {
  const segBySource = new Map<string, SourceSegment[]>();
  for (const s of data.segments) {
    const list = segBySource.get(s.sourceId) ?? [];
    list.push(s);
    segBySource.set(s.sourceId, list);
  }
  return JSON.stringify(
    {
      schemaVersion: data.schemaVersion,
      exportedAt: data.createdAt,
      appVersion: data.appVersion,
      sources: data.sources.map((s) => ({ ...s, segments: (segBySource.get(s.id) ?? []).sort((a, b) => a.index - b.index) })),
      annotations: data.annotations,
      concepts: data.concepts,
      relations: data.relations,
      learningItems: data.items,
      reviewStates: data.reviewStates,
      reviewEvents: data.reviewEvents,
      applicationTasks: data.tasks,
      sessions: data.sessions,
      readingStates: data.readingStates,
      settings: data.settings,
    },
    null,
    2,
  );
}

function safeJson(text: string, where: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('RST-002', `json:${where}`);
  }
}

function validateAll(data: BackupData): void {
  for (const kind of Object.keys(DATA_FILES) as RecordKind[]) validateRecords(kind, data[kind]);
}

function computeWarnings(d: BackupData): ParsedBackup['warnings'] {
  const sourceIds = new Set(d.sources.map((s) => s.id));
  const itemIds = new Set(d.items.map((i) => i.id));
  return {
    orphanSegments: d.segments.filter((s) => !sourceIds.has(s.sourceId)).length,
    orphanStates: d.reviewStates.filter((s) => !itemIds.has(s.learningItemId)).length,
    orphanEvents: d.reviewEvents.filter((e) => !itemIds.has(e.learningItemId)).length,
  };
}

function finalize(data: BackupData, originals: OriginalFile[], format: 'zip' | 'json', encrypted: boolean): ParsedBackup {
  const compatibility = checkCompatibility(parseSemVer(data.schemaVersion), parseSemVer(DATA_SCHEMA_VERSION));
  validateAll(data);
  data.settings = sanitizeSettings(data.settings);
  return { data, originals, format, encrypted, compatibility, warnings: computeWarnings(data) };
}

function parseJsonExport(text: string, encrypted: boolean): ParsedBackup {
  const raw = safeJson(text, 'export') as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sources)) throw new AppError('RST-002', 'shape');
  const segments: SourceSegment[] = [];
  const sources = (raw.sources as (Source & { segments?: SourceSegment[] })[]).map((s) => {
    if (!s || typeof s !== 'object') throw new AppError('RST-002', 'sources');
    const { segments: segs, ...rest } = s;
    if (Array.isArray(segs)) segments.push(...segs);
    return rest as Source;
  });
  const arr = <T>(k: string): T[] => (raw[k] == null ? [] : (raw[k] as T[]));
  const data: BackupData = {
    schemaVersion: String(raw.schemaVersion ?? ''),
    appVersion: String(raw.appVersion ?? ''),
    createdAt: String(raw.exportedAt ?? nowIso()),
    sources,
    segments,
    annotations: arr('annotations'),
    concepts: arr('concepts'),
    relations: arr('relations'),
    items: arr('learningItems'),
    reviewStates: arr('reviewStates'),
    reviewEvents: arr('reviewEvents'),
    tasks: arr('applicationTasks'),
    sessions: arr('sessions'),
    readingStates: arr('readingStates'),
    settings: (raw.settings as Settings) ?? sanitizeSettings(undefined),
  };
  return finalize(data, [], 'json', encrypted);
}

function isSafeEntryPath(p: string): boolean {
  if (p.startsWith('/') || p.includes('\\') || p.split('/').some((seg) => seg === '..' || seg === '.')) return false;
  return p === 'manifest.json' || p === 'checksums.sha256' || /^data\/[a-z-]+\.json$/.test(p) || /^originals\/[A-Za-z0-9_-]+\.[a-z0-9]{1,5}$/.test(p);
}

/**
 * Yedeği doğrular: (şifre çözme) → manifest → sağlama toplamı → şema → sürüm uyumu.
 * Hiçbir şey yazmaz. Bozuk/eksik yedek sessizce kabul edilmez.
 */
export async function parseBackupBytes(input: Uint8Array, password?: string): Promise<ParsedBackup> {
  let bytes = input;
  let encrypted = false;
  if (isEncryptedBackup(bytes)) {
    if (!password) throw new AppError('RST-003', 'password-required');
    bytes = await decryptBytes(bytes, password);
    encrypted = true;
  }
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    const text = new TextDecoder('utf-8').decode(bytes);
    if (!text.trimStart().startsWith('{')) throw new AppError('RST-002', 'unknown-format');
    return parseJsonExport(text, encrypted);
  }

  let total = 0;
  let unsafe = false;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter(file) {
        if (!isSafeEntryPath(file.name)) {
          unsafe = true;
          return false;
        }
        total += file.originalSize;
        if (file.originalSize > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) {
          unsafe = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new AppError('RST-002', 'zip');
  }
  if (unsafe) throw new AppError('RST-002', 'unsafe-entry');
  const manifestBytes = entries['manifest.json'];
  const checksumBytes = entries['checksums.sha256'];
  if (!manifestBytes || !checksumBytes) throw new AppError('RST-002', 'missing-manifest');
  const manifest = safeJson(strFromU8(manifestBytes), 'manifest') as {
    format?: string;
    schemaVersion?: string;
    appVersion?: string;
    createdAt?: string;
    originals?: { id: string; sourceId: string; mimeType: string; path: string }[];
  };
  if (manifest.format !== 'nexlearn-backup') throw new AppError('RST-002', 'format');
  parseSemVer(manifest.schemaVersion);

  // Sağlama toplamları: listelenen her dosya mevcut ve eşleşmeli; listelenmeyen dosya kabul edilmez.
  const listed = new Map<string, string>();
  for (const line of strFromU8(checksumBytes).split('\n')) {
    const m = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
    if (m) listed.set(m[2], m[1]);
  }
  for (const path of Object.keys(entries)) {
    if (path === 'checksums.sha256') continue;
    const want = listed.get(path);
    if (!want) throw new AppError('RST-002', 'unlisted-file');
    if ((await sha256Hex(entries[path])) !== want) throw new AppError('RST-002', 'checksum');
  }
  for (const path of listed.keys()) if (!entries[path]) throw new AppError('RST-002', 'missing-file');

  const read = <T>(path: string, required = true): T => {
    const b = entries[path];
    if (!b) {
      if (required) throw new AppError('RST-002', `missing:${path}`);
      return [] as T;
    }
    return safeJson(strFromU8(b), path) as T;
  };
  const data: BackupData = {
    schemaVersion: manifest.schemaVersion!,
    appVersion: String(manifest.appVersion ?? ''),
    createdAt: String(manifest.createdAt ?? ''),
    sources: read(DATA_FILES.sources),
    segments: read(DATA_FILES.segments),
    annotations: read(DATA_FILES.annotations),
    concepts: read(DATA_FILES.concepts),
    relations: read(DATA_FILES.relations),
    items: read(DATA_FILES.items),
    reviewStates: read(DATA_FILES.reviewStates),
    reviewEvents: read(DATA_FILES.reviewEvents),
    tasks: read(DATA_FILES.tasks, false),
    sessions: read(DATA_FILES.sessions, false),
    readingStates: read(DATA_FILES.readingStates, false),
    settings: read<Settings>('data/settings.json', false),
  };
  const originals: OriginalFile[] = (manifest.originals ?? []).map((o) => {
    const b = entries[o.path];
    if (!b || typeof o.sourceId !== 'string' || typeof o.id !== 'string') throw new AppError('RST-002', 'original');
    return { id: o.id, sourceId: o.sourceId, mimeType: String(o.mimeType), bytes: b };
  });
  return finalize(data, originals, 'zip', encrypted);
}

export async function parseBackupFile(file: Blob, password?: string): Promise<ParsedBackup> {
  return parseBackupBytes(new Uint8Array(await file.arrayBuffer()), password);
}

/** Geri yükleme öncesi mevcut verinin geri alınabilir anlık görüntüsünü saklar (yalnızca en son biri tutulur). */
async function savePreRestoreSnapshot(): Promise<void> {
  const data = await collectData();
  const files = await collectOriginals();
  const originals = await Promise.all(files.map(async (f) => ({ id: f.id, sourceId: f.sourceId, mimeType: f.mimeType, bytes: new Uint8Array(await f.blob.arrayBuffer()) })));
  const zip = await buildBackupZip(data, originals);
  const db = await getDb();
  const tx = db.transaction('snapshots', 'readwrite');
  await tx.store.clear();
  const snap: Snapshot = { id: newId('snap'), createdAt: nowIso(), reason: 'pre-restore', blob: new Blob([zip as BlobPart], { type: 'application/zip' }) };
  await tx.store.put(snap);
  await tx.done;
}

export async function getLatestSnapshot(): Promise<Snapshot | undefined> {
  const db = await getDb();
  const all = await db.getAll('snapshots');
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/**
 * Doğrulanmış yedeği geri yükler (mevcut verinin yerine). Önce anlık görüntü alınır, sonra tüm yazma
 * tek bir IndexedDB işleminde yapılır: hata olursa hiçbir şey değişmez.
 */
export async function restoreBackup(parsed: ParsedBackup, opts: { snapshot?: boolean } = {}): Promise<void> {
  if (opts.snapshot !== false) await savePreRestoreSnapshot();
  const d = parsed.data;
  const db = await getDb();
  const stores = [...DATA_STORES, 'files', 'settings'] as const;
  const tx = db.transaction([...stores], 'readwrite');
  // Yedekte orijinal yoksa, aynı kaynak kimliğine ve içeriğe sahip mevcut dosyalar korunur.
  const restoredSources = new Map(d.sources.map((s) => [s.id, s]));
  const keepFiles = parsed.originals.length
    ? []
    : (await tx.objectStore('files').getAll()).filter((f) => restoredSources.get(f.sourceId)?.storageRef === f.id);
  for (const s of stores) await tx.objectStore(s).clear();
  const putAll = async <S extends (typeof DATA_STORES)[number]>(s: S, list: readonly unknown[]) => {
    for (const rec of list) await tx.objectStore(s).put(rec as never);
  };
  await putAll('sources', d.sources);
  await putAll('segments', d.segments);
  await putAll('annotations', d.annotations);
  await putAll('concepts', d.concepts);
  await putAll('relations', d.relations);
  await putAll('items', d.items);
  await putAll('reviewStates', d.reviewStates);
  await putAll('reviewEvents', d.reviewEvents);
  await putAll('tasks', d.tasks);
  await putAll('sessions', d.sessions);
  await putAll('readingStates', d.readingStates);
  for (const f of keepFiles) await tx.objectStore('files').put(f);
  for (const o of parsed.originals) {
    const src = restoredSources.get(o.sourceId);
    if (!src) continue;
    await tx.objectStore('files').put({
      id: src.storageRef ?? o.id,
      sourceId: o.sourceId,
      blob: new Blob([o.bytes as BlobPart], { type: o.mimeType }),
      mimeType: o.mimeType,
      sizeBytes: o.bytes.byteLength,
    });
  }
  await tx.objectStore('settings').put({ ...sanitizeSettings(d.settings), id: 'app' });
  await tx.done;
  emitChange([...stores]);
}

/** Son geri yüklemeyi geri alır (anlık görüntüden). */
export async function undoLastRestore(): Promise<boolean> {
  const snap = await getLatestSnapshot();
  if (!snap) return false;
  const parsed = await parseBackupFile(snap.blob);
  await restoreBackup(parsed, { snapshot: false });
  const db = await getDb();
  await db.delete('snapshots', snap.id);
  emitChange(['snapshots']);
  return true;
}

/** Tüm kullanıcı verisini kalıcı olarak siler (ayarlar dahil). Ayrı ve açıkça onaylanmış işlemdir. */
export async function deleteAllData(): Promise<void> {
  const db = await getDb();
  const stores = [...DATA_STORES, 'files', 'settings', 'snapshots'] as const;
  const tx = db.transaction([...stores], 'readwrite');
  for (const s of stores) await tx.objectStore(s).clear();
  await tx.done;
  emitChange([...stores]);
}
