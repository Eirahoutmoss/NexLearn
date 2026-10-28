import { AppError, toAppError } from '../../domain/errors';
import { newId, nowIso } from '../../domain/ids';
import type { BaseEntity } from '../../domain/types';
import { emitChange, getDb, type NexDB, type StoreName } from './db';

/** BaseEntity taşıyan depolar. */
export type EntityStore = 'sources' | 'annotations' | 'concepts' | 'relations' | 'items' | 'tasks';

type EntityOf<S extends EntityStore> = NexDB[S]['value'];
export type NewEntity<T extends BaseEntity> = Omit<T, keyof BaseEntity> & Partial<Pick<BaseEntity, 'id' | 'isSample'>>;

const PREFIX: Record<EntityStore, string> = {
  sources: 'src',
  annotations: 'ann',
  concepts: 'con',
  relations: 'rel',
  items: 'li',
  tasks: 'tsk',
};

export function buildEntity<S extends EntityStore>(store: S, data: NewEntity<EntityOf<S>>, now = new Date()): EntityOf<S> {
  const ts = nowIso(now);
  return {
    ...data,
    id: data.id ?? newId(PREFIX[store]),
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    revision: 1,
  } as EntityOf<S>;
}

export async function createEntity<S extends EntityStore>(store: S, data: NewEntity<EntityOf<S>>): Promise<EntityOf<S>> {
  const entity = buildEntity(store, data);
  const db = await getDb();
  try {
    await db.add(store, entity as never);
  } catch (e) {
    throw toAppError(e);
  }
  emitChange([store]);
  return entity;
}

export async function getEntity<S extends EntityStore>(store: S, id: string): Promise<EntityOf<S> | undefined> {
  const db = await getDb();
  return (await db.get(store, id)) as EntityOf<S> | undefined;
}

/** Silinmemiş tüm kayıtlar. */
export async function listLive<S extends EntityStore>(store: S): Promise<EntityOf<S>[]> {
  const db = await getDb();
  const all = (await db.getAll(store)) as EntityOf<S>[];
  return all.filter((e) => !e.deletedAt);
}

export async function listDeleted<S extends EntityStore>(store: S): Promise<EntityOf<S>[]> {
  const db = await getDb();
  const all = (await db.getAll(store)) as EntityOf<S>[];
  return all.filter((e) => Boolean(e.deletedAt));
}

/**
 * Kaydı günceller. `expectedRevision` verilirse ve depodaki sürüm farklıysa DB-003 (çakışma) fırlatır.
 * Güncelleme tek işlem (transaction) içinde okunur ve yazılır.
 */
export async function updateEntity<S extends EntityStore>(
  store: S,
  id: string,
  patch: Partial<Omit<EntityOf<S>, 'id' | 'createdAt' | 'revision'>>,
  expectedRevision?: number,
): Promise<EntityOf<S>> {
  const db = await getDb();
  const tx = db.transaction(store, 'readwrite');
  const current = (await tx.store.get(id)) as EntityOf<S> | undefined;
  if (!current) {
    tx.done.catch(() => undefined);
    tx.abort();
    throw new AppError('DB-004', store);
  }
  if (expectedRevision != null && current.revision !== expectedRevision) {
    tx.done.catch(() => undefined);
    tx.abort();
    throw new AppError('DB-003', store);
  }
  const next = { ...current, ...patch, id, updatedAt: nowIso(), revision: current.revision + 1 } as EntityOf<S>;
  await tx.store.put(next as never);
  await tx.done;
  emitChange([store]);
  return next;
}

export async function softDelete(store: EntityStore, id: string): Promise<void> {
  await updateEntity(store, id, { deletedAt: nowIso() } as never);
}

export async function restoreDeleted(store: EntityStore, id: string): Promise<void> {
  await updateEntity(store, id, { deletedAt: null } as never);
}

/** Basit anahtar-değer erişimi (yan depolar için). */
export async function putRecord<S extends StoreName>(store: S, value: NexDB[S]['value']): Promise<void> {
  const db = await getDb();
  await db.put(store, value as never);
  emitChange([store]);
}

export async function getRecord<S extends StoreName>(store: S, key: string): Promise<NexDB[S]['value'] | undefined> {
  const db = await getDb();
  return (await db.get(store, key)) as NexDB[S]['value'] | undefined;
}

export async function getAllRecords<S extends StoreName>(store: S): Promise<NexDB[S]['value'][]> {
  const db = await getDb();
  return (await db.getAll(store)) as NexDB[S]['value'][];
}
