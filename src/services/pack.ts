import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { emitChange, getDb } from '../adapters/storage/db';
import { AppError } from '../domain/errors';
import { sha256Hex } from '../domain/hash';
import { newId, nowIso } from '../domain/ids';
import { ALGORITHM_VERSION, initialSchedule } from '../domain/scheduler';
import type { Annotation, BaseEntity, Concept, ConceptRelation, FileRecord, LearningItem, PackOrigin, ReviewState, Source, SourceRef, SourceSegment } from '../domain/types';
import { validateRecords } from './backup/validate';

/**
 * NexLearn paketi (.nexpack): kaynakları, kavramları, ilişkileri ve kartları başkalarıyla paylaşmak için.
 * - "study" (çalışma grubu): bir kez paylaşılan kopya.
 * - "knowledge" (kurumsal bilgi tabanı): aynı packId ile yeniden yayımlanır; içe aktarınca yerel kopya
 *   güncellenir, kişisel tekrar geçmişi ve notlar korunur.
 * Kişisel veriler (tekrar durumu/geçmişi, okuma konumu, oturumlar, ayarlar) pakete hiç girmez.
 * Biçim: docs/NEXPACK.md
 */
export const PACK_FORMAT = 'nexpack';
export const PACK_FORMAT_VERSION = 1;
const MAX_PACK_BYTES = 400 * 1024 * 1024;
const MAX_RECORDS = 200_000;

export type PackKind = 'study' | 'knowledge';

export interface PackManifest {
  format: typeof PACK_FORMAT;
  formatVersion: number;
  packId: string;
  version: number;
  kind: PackKind;
  title: string;
  description: string;
  author: string;
  createdAt: string;
  appVersion: string;
  counts: Record<string, number>;
  contentSha256: string;
  files: { itemId: string; path: string; mimeType: string; sha256: string }[];
}

export interface PackContent {
  sources: Source[];
  segments: SourceSegment[];
  annotations: Annotation[];
  concepts: Concept[];
  relations: ConceptRelation[];
  items: LearningItem[];
}

export interface ParsedPack {
  manifest: PackManifest;
  content: PackContent;
  files: Map<string, { bytes: Uint8Array; mimeType: string }>;
}

export interface PublishedPack {
  packId: string;
  version: number;
  kind: PackKind;
  title: string;
  description: string;
  author: string;
  sourceIds: string[];
  updatedAt: string;
}

export interface ExportPackOptions {
  title: string;
  description?: string;
  author?: string;
  kind: PackKind;
  sourceIds: string[];
  includeCards: boolean;
  includeConcepts: boolean;
  includeNotes: boolean;
  includeOriginals: boolean;
  /** Var olan bir yayını güncellemek için (kurumsal bilgi tabanı). */
  packId?: string;
  now?: Date;
}

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/* ---------- Yayımlanan paketlerin kaydı (yayıncı tarafı) ---------- */

const PUBLISHED_KEY = 'publishedPacks';

export async function listPublishedPacks(): Promise<PublishedPack[]> {
  const db = await getDb();
  const rec = await db.get('meta', PUBLISHED_KEY);
  if (!rec) return [];
  try {
    const v = JSON.parse(rec.value) as unknown;
    return Array.isArray(v) ? (v as PublishedPack[]) : [];
  } catch {
    return [];
  }
}

async function savePublished(list: PublishedPack[]): Promise<void> {
  const db = await getDb();
  await db.put('meta', { key: PUBLISHED_KEY, value: JSON.stringify(list) });
  emitChange(['meta']);
}

/* ---------- Dışa aktarma ---------- */

function strip<T extends BaseEntity>(e: T): T {
  const { isSample: _s, deletedAt: _d, pack: _p, ...rest } = e;
  return { ...rest, revision: 1 } as T;
}

function refsWithin(refs: SourceRef[], sources: Set<string>): SourceRef[] {
  return refs.filter((r) => sources.has(r.sourceId));
}

/** Seçilen kaynaklardan paket içeriğini toplar. */
export async function collectPackContent(opts: Pick<ExportPackOptions, 'sourceIds' | 'includeCards' | 'includeConcepts' | 'includeNotes'>): Promise<PackContent> {
  const db = await getDb();
  const wanted = new Set(opts.sourceIds);
  const sources = (await db.getAll('sources')).filter((s) => wanted.has(s.id) && !s.deletedAt);
  const ids = new Set(sources.map((s) => s.id));
  const segments = (await db.getAll('segments')).filter((s) => ids.has(s.sourceId)).map(({ isSample: _s, ...s }) => s as SourceSegment);
  const annotations = opts.includeNotes ? (await db.getAll('annotations')).filter((a) => ids.has(a.sourceId) && !a.deletedAt).map(strip) : [];

  const allItems = (await db.getAll('items')).filter((i) => !i.deletedAt);
  const items = opts.includeCards ? allItems.filter((i) => i.sourceRefs.some((r) => ids.has(r.sourceId))) : [];

  let concepts: Concept[] = [];
  let relations: ConceptRelation[] = [];
  if (opts.includeConcepts) {
    const cardConcepts = new Set(items.flatMap((i) => i.conceptIds));
    concepts = (await db.getAll('concepts')).filter((c) => !c.deletedAt && (c.sourceRefs.some((r) => ids.has(r.sourceId)) || cardConcepts.has(c.id)));
    const cIds = new Set(concepts.map((c) => c.id));
    relations = (await db.getAll('relations')).filter((r) => !r.deletedAt && cIds.has(r.fromConceptId) && cIds.has(r.toConceptId));
  }
  const conceptIds = new Set(concepts.map((c) => c.id));
  return {
    sources: sources.map((s) => {
      const { dismissedKeywords: _k, ...metadata } = s.metadata;
      return { ...strip(s), metadata };
    }),
    segments,
    annotations,
    concepts: concepts.map((c) => ({ ...strip(c), sourceRefs: refsWithin(c.sourceRefs, ids) })),
    relations: relations.map((r) => ({ ...strip(r), sourceRefs: refsWithin(r.sourceRefs, ids) })),
    items: items.map((i) => ({ ...strip(i), sourceRefs: refsWithin(i.sourceRefs, ids), conceptIds: i.conceptIds.filter((c) => conceptIds.has(c)) })),
  };
}

export async function exportPack(opts: ExportPackOptions): Promise<{ bytes: Uint8Array; fileName: string; manifest: PackManifest }> {
  const title = opts.title.trim();
  if (!title) throw new AppError('VAL-001', 'title');
  if (!opts.sourceIds.length) throw new AppError('VAL-001', 'sources');
  const now = opts.now ?? new Date();
  const published = await listPublishedPacks();
  const prev = opts.packId ? published.find((p) => p.packId === opts.packId) : undefined;
  const packId = prev?.packId ?? newId('pck');
  const version = (prev?.version ?? 0) + 1;

  const content = await collectPackContent(opts);
  const files: Zippable = {};
  const fileIndex: PackManifest['files'] = [];
  if (opts.includeOriginals) {
    const db = await getDb();
    for (const s of content.sources) {
      if (!s.storageRef) continue;
      const rec = await db.get('files', s.storageRef);
      if (!rec) continue;
      const bytes = new Uint8Array(await rec.blob.arrayBuffer());
      const path = `files/${s.id}.${MIME_EXT[rec.mimeType] ?? 'bin'}`;
      files[path] = [bytes, { level: 0 }];
      fileIndex.push({ itemId: s.id, path, mimeType: rec.mimeType, sha256: await sha256Hex(bytes) });
    }
  }
  for (const s of content.sources) if (!fileIndex.some((f) => f.itemId === s.id)) delete s.storageRef;

  const contentBytes = strToU8(JSON.stringify(content));
  const manifest: PackManifest = {
    format: PACK_FORMAT,
    formatVersion: PACK_FORMAT_VERSION,
    packId,
    version,
    kind: opts.kind,
    title: title.slice(0, 200),
    description: (opts.description ?? '').trim().slice(0, 2000),
    author: (opts.author ?? '').trim().slice(0, 120),
    createdAt: nowIso(now),
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
    counts: Object.fromEntries(Object.entries(content).map(([k, v]) => [k, (v as unknown[]).length])),
    contentSha256: await sha256Hex(contentBytes),
    files: fileIndex,
  };
  files['content.json'] = [contentBytes, { level: 6 }];
  files['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];
  const bytes = zipSync(files);
  // Üretilen paket hemen geri okunarak doğrulanır.
  await parsePack(bytes);

  const entry: PublishedPack = { packId, version, kind: opts.kind, title: manifest.title, description: manifest.description, author: manifest.author, sourceIds: opts.sourceIds, updatedAt: manifest.createdAt };
  await savePublished([...published.filter((p) => p.packId !== packId), entry]);

  // Dosya adı ASCII tutulur: bazı tarayıcılar ve telefonlar ASCII dışı indirme adlarını yok sayar.
  const tr: Record<string, string> = { ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };
  const slug =
    manifest.title
      .toLocaleLowerCase('tr')
      .replace(/[ğüşıöçâîû]/g, (c) => tr[c] ?? c)
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'paket';
  return { bytes, fileName: `${slug}-v${version}.nexpack`, manifest };
}

/* ---------- Okuma ve doğrulama ---------- */

export function looksLikePack(name: string): boolean {
  return /\.nexpack$/i.test(name);
}

function isSafePath(p: string): boolean {
  if (p.startsWith('/') || p.includes('\\') || p.split('/').some((s) => s === '..' || s === '.' || s === '')) return false;
  return p === 'manifest.json' || p === 'content.json' || /^files\/[A-Za-z0-9_-]+\.[a-z0-9]{1,5}$/.test(p);
}

function str(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

export async function parsePack(bytes: Uint8Array): Promise<ParsedPack> {
  if (bytes.length > MAX_PACK_BYTES) throw new AppError('SRC-004', String(MAX_PACK_BYTES));
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (f) => isSafePath(f.name) });
  } catch {
    throw new AppError('PCK-001', 'zip');
  }
  if (!entries['manifest.json'] || !entries['content.json']) throw new AppError('PCK-001', 'missing');
  let manifest: PackManifest;
  let content: PackContent;
  try {
    manifest = JSON.parse(strFromU8(entries['manifest.json'])) as PackManifest;
    content = JSON.parse(strFromU8(entries['content.json'])) as PackContent;
  } catch {
    throw new AppError('PCK-001', 'json');
  }
  if (!manifest || manifest.format !== PACK_FORMAT) throw new AppError('PCK-001', 'format');
  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > PACK_FORMAT_VERSION) throw new AppError('PCK-002');
  if (!str(manifest.packId, 64) || !/^[A-Za-z0-9_-]+$/.test(manifest.packId)) throw new AppError('PCK-001', 'packId');
  if (!Number.isInteger(manifest.version) || manifest.version < 1) throw new AppError('PCK-001', 'version');
  if (manifest.kind !== 'study' && manifest.kind !== 'knowledge') throw new AppError('PCK-001', 'kind');
  if (!str(manifest.title, 200) || !str(manifest.description ?? '', 2000) || !str(manifest.author ?? '', 120)) throw new AppError('PCK-001', 'text');
  if ((await sha256Hex(entries['content.json'])) !== manifest.contentSha256) throw new AppError('PCK-001', 'checksum');

  const kinds = ['sources', 'segments', 'annotations', 'concepts', 'relations', 'items'] as const;
  let total = 0;
  for (const k of kinds) {
    const list = (content as unknown as Record<string, unknown>)[k] ?? [];
    try {
      validateRecords(k, list);
    } catch {
      throw new AppError('PCK-001', `content:${k}`);
    }
    (content as unknown as Record<string, unknown>)[k] = list;
    total += (list as unknown[]).length;
  }
  if (total > MAX_RECORDS) throw new AppError('PCK-001', 'too-many');

  const files = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  for (const f of Array.isArray(manifest.files) ? manifest.files : []) {
    const data = entries[f.path];
    if (!data || !isSafePath(f.path)) throw new AppError('PCK-001', 'file-missing');
    if ((await sha256Hex(data)) !== f.sha256) throw new AppError('PCK-001', 'file-checksum');
    files.set(f.itemId, { bytes: data, mimeType: String(f.mimeType) });
  }
  return { manifest: { ...manifest, description: manifest.description ?? '', author: manifest.author ?? '' }, content, files };
}

/* ---------- İçe aktarma (yeni kopya ya da güncelleme) ---------- */

export interface PackStatus {
  installed: { version: number } | null;
  action: 'install' | 'update' | 'same' | 'older';
}

async function installedVersion(packId: string): Promise<number | null> {
  const db = await getDb();
  const all = [...(await db.getAll('sources')), ...(await db.getAll('items')), ...(await db.getAll('concepts'))];
  let v: number | null = null;
  for (const e of all) if (e.pack?.id === packId && !e.deletedAt) v = Math.max(v ?? 0, e.pack.version);
  return v;
}

export async function packStatus(manifest: PackManifest): Promise<PackStatus> {
  const v = await installedVersion(manifest.packId);
  if (v == null) return { installed: null, action: 'install' };
  return { installed: { version: v }, action: manifest.version > v ? 'update' : manifest.version === v ? 'same' : 'older' };
}

export interface PackApplyResult {
  created: number;
  updated: number;
  removed: number;
}

/**
 * Paketi uygular. Aynı paketten daha önce gelen kayıtlar `pack.itemId` ile eşleşir ve güncellenir;
 * yeni sürümde olmayanlar çöp kutusuna taşınır. Kullanıcının kendi kayıtlarına dokunulmaz.
 * `asCopy`: eşleştirme yapmadan bağımsız yeni kopya oluşturur.
 */
export async function applyPack(parsed: ParsedPack, opts: { asCopy?: boolean; now?: Date } = {}): Promise<PackApplyResult> {
  const { manifest, content } = parsed;
  const now = opts.now ?? new Date();
  const ts = nowIso(now);
  const db = await getDb();
  const stores = ['sources', 'segments', 'files', 'annotations', 'concepts', 'relations', 'items', 'reviewStates'] as const;
  const tx = db.transaction([...stores], 'readwrite');
  const result: PackApplyResult = { created: 0, updated: 0, removed: 0 };
  const origin = (itemId: string): PackOrigin => ({ id: manifest.packId, itemId, version: manifest.version });

  // Yerel eşleşmeler: itemId → yerel kayıt
  type AnyEntity = BaseEntity & { pack?: PackOrigin };
  const existing = async <T extends AnyEntity>(store: 'sources' | 'annotations' | 'concepts' | 'relations' | 'items'): Promise<Map<string, T>> => {
    const m = new Map<string, T>();
    if (opts.asCopy) return m;
    for (const e of (await tx.objectStore(store).getAll()) as unknown as T[]) if (e.pack?.id === manifest.packId) m.set(e.pack.itemId, e);
    return m;
  };
  const exSources = await existing<Source>('sources');
  const exAnn = await existing<Annotation>('annotations');
  const exConcepts = await existing<Concept>('concepts');
  const exRelations = await existing<ConceptRelation>('relations');
  const exItems = await existing<LearningItem>('items');

  const idMap = new Map<string, string>();
  const mapId = (itemId: string, ex: Map<string, AnyEntity>, prefix: string) => {
    const id = ex.get(itemId)?.id ?? newId(prefix);
    idMap.set(itemId, id);
    return id;
  };
  content.sources.forEach((s) => mapId(s.id, exSources as Map<string, AnyEntity>, 'src'));
  content.concepts.forEach((c) => mapId(c.id, exConcepts as Map<string, AnyEntity>, 'con'));

  // Segment kimlikleri: güncellemede aynı (kaynak, itemId) korunur ki kullanıcının vurguları kopmasın.
  const segMap = new Map<string, string>();
  const oldSegsBySource = new Map<string, SourceSegment[]>();
  for (const s of content.sources) {
    const local = exSources.get(s.id);
    if (!local) continue;
    const old = (await tx.objectStore('segments').index('sourceId').getAll(local.id)) as SourceSegment[];
    oldSegsBySource.set(local.id, old);
    for (const seg of old) if (seg.pack?.itemId) segMap.set(seg.pack.itemId, seg.id);
  }
  for (const seg of content.segments) if (!segMap.has(seg.id)) segMap.set(seg.id, newId('seg'));

  const mapRefs = (refs: SourceRef[]): SourceRef[] =>
    refs
      .filter((r) => idMap.has(r.sourceId))
      .map((r) => ({ ...r, sourceId: idMap.get(r.sourceId)!, ...(r.segmentId ? { segmentId: segMap.get(r.segmentId) } : {}) }));

  const upsert = async <T extends AnyEntity>(store: 'sources' | 'annotations' | 'concepts' | 'relations' | 'items', incoming: T, ex: Map<string, T>, id: string, keep: (local: T) => Partial<T> = () => ({})) => {
    const local = ex.get(incoming.id);
    const rec = local
      ? { ...incoming, ...keep(local), id, createdAt: local.createdAt, updatedAt: ts, deletedAt: null, revision: local.revision + 1, pack: origin(incoming.id) }
      : { ...incoming, id, createdAt: ts, updatedAt: ts, deletedAt: null, revision: 1, pack: origin(incoming.id) };
    await tx.objectStore(store).put(rec as never);
    if (local) result.updated++;
    else result.created++;
  };

  // Kaynaklar + dosyalar + segmentler
  for (const s of content.sources) {
    const id = idMap.get(s.id)!;
    const local = exSources.get(s.id);
    let storageRef = local?.storageRef;
    const file = parsed.files.get(s.id);
    if (file) {
      if (storageRef) await tx.objectStore('files').delete(storageRef);
      storageRef = newId('fil');
      const rec: FileRecord = { id: storageRef, sourceId: id, blob: new Blob([file.bytes as BlobPart], { type: file.mimeType }), mimeType: file.mimeType, sizeBytes: file.bytes.length };
      await tx.objectStore('files').add(rec);
    }
    const { storageRef: _ignored, ...rest } = s;
    const metadata = { ...rest.metadata, packTitle: manifest.title, packAuthor: manifest.author || null };
    await upsert('sources', { ...rest, metadata, ...(storageRef ? { storageRef } : {}) } as Source, exSources, id, (l) => ({ tags: [...new Set([...s.tags, ...l.tags])] }));
    const incomingSegIds = new Set<string>();
    for (const seg of content.segments.filter((g) => g.sourceId === s.id)) {
      const segId = segMap.get(seg.id)!;
      incomingSegIds.add(segId);
      await tx.objectStore('segments').put({ ...seg, id: segId, sourceId: id, pack: origin(seg.id) });
    }
    for (const old of oldSegsBySource.get(id) ?? []) if (!incomingSegIds.has(old.id)) await tx.objectStore('segments').delete(old.id);
  }

  // Kavramlar (yerel konum korunur), ilişkiler
  for (const c of content.concepts) {
    await upsert('concepts', { ...c, provenance: 'imported', sourceRefs: mapRefs(c.sourceRefs) } as Concept, exConcepts, idMap.get(c.id)!, (l) => ({ position: l.position ?? null }));
  }
  for (const r of content.relations) {
    if (!idMap.has(r.fromConceptId) || !idMap.has(r.toConceptId)) continue;
    const id = exRelations.get(r.id)?.id ?? newId('rel');
    await upsert('relations', { ...r, fromConceptId: idMap.get(r.fromConceptId)!, toConceptId: idMap.get(r.toConceptId)!, provenance: 'imported', sourceRefs: mapRefs(r.sourceRefs) } as ConceptRelation, exRelations, id);
  }

  // Kartlar: yeni kartlara tekrar durumu açılır; güncellenen kartların kişisel planı korunur.
  for (const i of content.items) {
    const local = exItems.get(i.id);
    const id = local?.id ?? newId('li');
    await upsert('items', { ...i, provenance: 'imported', sourceRefs: mapRefs(i.sourceRefs), conceptIds: i.conceptIds.filter((c) => idMap.has(c)).map((c) => idMap.get(c)!) } as LearningItem, exItems, id, (l) => ({ suspended: l.suspended }));
    if (!local || !(await tx.objectStore('reviewStates').get(id))) {
      const state: ReviewState = { learningItemId: id, ...initialSchedule(now), algorithmVersion: ALGORITHM_VERSION, revision: 1 };
      await tx.objectStore('reviewStates').put(state);
    }
  }

  // Paylaşılan notlar
  for (const a of content.annotations) {
    const sourceId = idMap.get(a.sourceId);
    const segmentId = segMap.get(a.segmentId);
    if (!sourceId || !segmentId) continue;
    const id = exAnn.get(a.id)?.id ?? newId('ann');
    await upsert('annotations', { ...a, sourceId, segmentId } as Annotation, exAnn, id);
  }

  // Yeni sürümde olmayan paket kayıtları çöp kutusuna
  if (!opts.asCopy) {
    const keep = {
      sources: new Set(content.sources.map((x) => x.id)),
      annotations: new Set(content.annotations.map((x) => x.id)),
      concepts: new Set(content.concepts.map((x) => x.id)),
      relations: new Set(content.relations.map((x) => x.id)),
      items: new Set(content.items.map((x) => x.id)),
    };
    const pairs: [keyof typeof keep, Map<string, AnyEntity>][] = [
      ['sources', exSources as Map<string, AnyEntity>],
      ['annotations', exAnn as Map<string, AnyEntity>],
      ['concepts', exConcepts as Map<string, AnyEntity>],
      ['relations', exRelations as Map<string, AnyEntity>],
      ['items', exItems as Map<string, AnyEntity>],
    ];
    for (const [store, ex] of pairs) {
      for (const [itemId, local] of ex) {
        if (keep[store].has(itemId) || local.deletedAt) continue;
        await tx.objectStore(store).put({ ...local, deletedAt: ts, updatedAt: ts, revision: local.revision + 1 } as never);
        result.removed++;
      }
    }
  }

  await tx.done;
  emitChange([...stores]);
  return result;
}
