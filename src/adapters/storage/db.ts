import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { AppError } from '../../domain/errors';
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

/** IndexedDB şema sürümü. Artırıldığında `upgrade` içine göç adımı eklenir (bkz. docs/DATA_MODEL.md). */
export const DB_VERSION = 1;
/** 1.1.0: ReviewEvent.confidence, ayarlarda askConfidence/interleave, epub kaynak türü, practice oturumu (geriye uyumlu eklemeler). */
export const DATA_SCHEMA_VERSION = '1.1.0';

export interface Snapshot {
  id: string;
  createdAt: string;
  reason: 'pre-restore';
  blob: Blob;
}

export interface NexDB extends DBSchema {
  meta: { key: string; value: { key: string; value: string } };
  settings: { key: string; value: Settings & { id: string } };
  sources: { key: string; value: Source };
  segments: { key: string; value: SourceSegment; indexes: { sourceId: string } };
  files: { key: string; value: FileRecord; indexes: { sourceId: string } };
  annotations: { key: string; value: Annotation; indexes: { sourceId: string } };
  concepts: { key: string; value: Concept };
  relations: { key: string; value: ConceptRelation };
  items: { key: string; value: LearningItem };
  reviewStates: { key: string; value: ReviewState };
  reviewEvents: { key: string; value: ReviewEvent; indexes: { learningItemId: string; reviewedAt: string } };
  tasks: { key: string; value: ApplicationTask };
  sessions: { key: string; value: LearningSession; indexes: { startedAt: string } };
  readingStates: { key: string; value: ReadingState };
  snapshots: { key: string; value: Snapshot };
}

export type StoreName =
  | 'meta'
  | 'settings'
  | 'sources'
  | 'segments'
  | 'files'
  | 'annotations'
  | 'concepts'
  | 'relations'
  | 'items'
  | 'reviewStates'
  | 'reviewEvents'
  | 'tasks'
  | 'sessions'
  | 'readingStates'
  | 'snapshots';

/** Kullanıcı verisi taşıyan (yedeğe giren) depolar. */
export const DATA_STORES = [
  'sources',
  'segments',
  'annotations',
  'concepts',
  'relations',
  'items',
  'reviewStates',
  'reviewEvents',
  'tasks',
  'sessions',
  'readingStates',
] as const satisfies readonly StoreName[];

let dbName = 'nexlearn';
let dbPromise: Promise<IDBPDatabase<NexDB>> | null = null;

/** Testler için: farklı veritabanı adıyla temiz başlangıç. */
export function useDatabaseName(name: string): void {
  if (dbPromise) void dbPromise.then((d) => d.close());
  dbName = name;
  dbPromise = null;
}

export function getDb(): Promise<IDBPDatabase<NexDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NexDB>(dbName, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v0 → v1: ilk şema. Sonraki sürümlerde `if (oldVersion < 2) {...}` adımları eklenir.
        if (oldVersion < 1) {
          db.createObjectStore('meta', { keyPath: 'key' });
          db.createObjectStore('settings', { keyPath: 'id' });
          db.createObjectStore('sources', { keyPath: 'id' });
          db.createObjectStore('segments', { keyPath: 'id' }).createIndex('sourceId', 'sourceId');
          db.createObjectStore('files', { keyPath: 'id' }).createIndex('sourceId', 'sourceId');
          db.createObjectStore('annotations', { keyPath: 'id' }).createIndex('sourceId', 'sourceId');
          db.createObjectStore('concepts', { keyPath: 'id' });
          db.createObjectStore('relations', { keyPath: 'id' });
          db.createObjectStore('items', { keyPath: 'id' });
          db.createObjectStore('reviewStates', { keyPath: 'learningItemId' });
          const ev = db.createObjectStore('reviewEvents', { keyPath: 'id' });
          ev.createIndex('learningItemId', 'learningItemId');
          ev.createIndex('reviewedAt', 'reviewedAt');
          db.createObjectStore('tasks', { keyPath: 'id' });
          db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('startedAt', 'startedAt');
          db.createObjectStore('readingStates', { keyPath: 'sourceId' });
          db.createObjectStore('snapshots', { keyPath: 'id' });
        }
      },
      blocked() {
        // Eski sürüm başka sekmede açık; kullanıcı yeniden yüklemeye yönlendirilir.
      },
      blocking() {
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
    }).catch((e: unknown) => {
      dbPromise = null;
      throw new AppError('DB-001', e instanceof Error ? e.name : 'open');
    });
  }
  return dbPromise;
}

/* ---------- Değişiklik bildirimi (aynı sekme + diğer sekmeler) ---------- */

type Listener = (stores: ReadonlySet<StoreName>) => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  channel = new BroadcastChannel('nexlearn-changes');
  channel.onmessage = (ev: MessageEvent<StoreName[]>) => {
    const set = new Set(ev.data);
    listeners.forEach((l) => l(set));
  };
  return channel;
}

export function emitChange(stores: readonly StoreName[]): void {
  const set = new Set(stores);
  listeners.forEach((l) => l(set));
  try {
    getChannel()?.postMessage([...set]);
  } catch {
    /* sekmeler arası bildirim isteğe bağlı */
  }
}

export function subscribeChanges(listener: Listener): () => void {
  getChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
