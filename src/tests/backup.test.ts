import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildBackupZip, collectData, createBackup, deleteAllData, parseBackupBytes, restoreBackup, toExportJson, undoLastRestore } from '../services/backup/backup';
import { decryptBytes, encryptBytes } from '../services/backup/crypto';
import { checkCompatibility, parseSemVer } from '../services/backup/validate';
import { importFile, listSources, getSegments } from '../services/sources';
import { createCard, recordReview, listCards } from '../services/memory';
import { createConcept, createRelation } from '../services/learn';
import { createSegmentAnnotation } from '../services/annotations';
import { updateSettings, getSettings } from '../services/settings';
import { getDb } from '../adapters/storage/db';

async function seed() {
  const r = await importFile({ name: 'ağ.txt', bytes: new TextEncoder().encode('TCP güvenilir.\n\nUDP hızlı.') });
  if (r.status !== 'imported') throw new Error();
  const segs = await getSegments(r.source.id);
  await createSegmentAnnotation('note', segs[0], { noteText: 'Not #ağ' });
  const card = await createCard({ prompt: 'TCP?', answer: 'Güvenilir', sourceRefs: [{ sourceId: r.source.id, segmentId: segs[0].id }] });
  await recordReview(card.id, 'good');
  const a = await createConcept({ label: 'TCP' });
  const b = await createConcept({ label: 'IP' });
  await createRelation({ fromConceptId: b.id, toConceptId: a.id, relationType: 'prerequisite_of' });
  await updateSettings({ theme: 'ametist' });
  return r.source;
}

/** Karşılaştırma için kayıtları kimliğe göre sıralar. */
function norm(d: Awaited<ReturnType<typeof collectData>>) {
  const { createdAt: _c, ...rest } = d;
  const sortById = (xs: unknown[]) => [...xs].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, Array.isArray(v) ? sortById(v) : v]));
}

describe('yedekleme ve geri yükleme', () => {
  it('ZIP yedek → sil → geri yükle: tüm kayıtlar ve orijinal dosya birebir döner', async () => {
    await seed();
    const before = await collectData();
    const { bytes, fileName } = await createBackup({ includeOriginals: true });
    expect(fileName).toMatch(/^nexlearn-backup-\d{8}-\d{6}\.zip$/);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual(expect.arrayContaining(['manifest.json', 'checksums.sha256', 'data/sources.json', 'data/learning-items.json']));
    expect(Object.keys(entries).some((k) => k.startsWith('originals/'))).toBe(true);

    await deleteAllData();
    expect(await listSources()).toHaveLength(0);
    const parsed = await parseBackupBytes(bytes);
    expect(parsed.compatibility).toBe('same');
    await restoreBackup(parsed);
    const after = await collectData();
    expect(norm(after)).toEqual(norm(before));
    expect((await getSettings()).theme).toBe('ametist');
    const db = await getDb();
    expect(await db.getAll('files')).toHaveLength(1);
  });

  it('JSON dışa aktarma → içe aktarma → kayıt karşılaştırması', async () => {
    await seed();
    const before = await collectData();
    const json = toExportJson(before);
    const parsed = await parseBackupBytes(new TextEncoder().encode(json));
    expect(parsed.format).toBe('json');
    await deleteAllData();
    await restoreBackup(parsed);
    expect(norm(await collectData())).toEqual(norm(before));
  });

  it('şifreli yedek: doğru parola açar, yanlış parola reddedilir', async () => {
    await seed();
    const { bytes, fileName } = await createBackup({ includeOriginals: false, password: 'gizli-parola' });
    expect(fileName.endsWith('.nexlearn-enc')).toBe(true);
    await expect(parseBackupBytes(bytes)).rejects.toMatchObject({ code: 'RST-003' });
    await expect(parseBackupBytes(bytes, 'yanlış')).rejects.toMatchObject({ code: 'RST-003' });
    const ok = await parseBackupBytes(bytes, 'gizli-parola');
    expect(ok.encrypted).toBe(true);
    expect(ok.data.items).toHaveLength(1);
  });

  it('kurcalanmış yedek (sağlama toplamı) reddedilir ve mevcut veri bozulmaz', async () => {
    await seed();
    const { bytes } = await createBackup({ includeOriginals: false });
    const entries = unzipSync(bytes);
    entries['data/learning-items.json'] = strToU8('[]');
    const tampered = zipSync(entries);
    await expect(parseBackupBytes(tampered)).rejects.toMatchObject({ code: 'RST-002' });
    expect(await listCards()).toHaveLength(1);
  });

  it('yol manipülasyonu içeren ve listelenmemiş dosyalar reddedilir', async () => {
    await seed();
    const { bytes } = await createBackup({ includeOriginals: false });
    const entries = unzipSync(bytes);
    await expect(parseBackupBytes(zipSync({ ...entries, '../kotu.json': strToU8('{}') }))).rejects.toMatchObject({ code: 'RST-002' });
    await expect(parseBackupBytes(zipSync({ ...entries, 'data/extra.json': strToU8('[]') }))).rejects.toMatchObject({ code: 'RST-002' });
  });

  it('yapısal olarak bozuk kayıt reddedilir', async () => {
    const data = await collectData();
    data.items = [{ id: 1 } as never];
    const zip = await buildBackupZip(data, []);
    await expect(parseBackupBytes(zip)).rejects.toMatchObject({ code: 'RST-002' });
  });

  it('daha yeni major sürümden yedek RST-001 ile reddedilir; yeni minor kabul edilir', async () => {
    const data = await collectData();
    await expect(parseBackupBytes(await buildBackupZip({ ...data, schemaVersion: '2.0.0' }, []))).rejects.toMatchObject({ code: 'RST-001' });
    const ok = await parseBackupBytes(await buildBackupZip({ ...data, schemaVersion: '1.4.0' }, []));
    expect(ok.compatibility).toBe('newer-minor');
    expect(checkCompatibility(parseSemVer('0.9.0'), parseSemVer('1.0.0'))).toBe('migrate');
    expect(() => parseSemVer('1.0')).toThrow();
  });

  it('geri yükleme geri alınabilir (anlık görüntü)', async () => {
    await seed();
    const empty = await buildBackupZip(
      { ...(await collectData()), sources: [], segments: [], annotations: [], concepts: [], relations: [], items: [], reviewStates: [], reviewEvents: [], tasks: [], sessions: [], readingStates: [] },
      [],
    );
    await restoreBackup(await parseBackupBytes(empty));
    expect(await listSources()).toHaveLength(0);
    expect(await undoLastRestore()).toBe(true);
    expect(await listSources()).toHaveLength(1);
    expect(await listCards()).toHaveLength(1);
  });

  it('bozuk girdiler açık hata verir', async () => {
    await expect(parseBackupBytes(new TextEncoder().encode('merhaba'))).rejects.toMatchObject({ code: 'RST-002' });
    await expect(parseBackupBytes(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).rejects.toMatchObject({ code: 'RST-002' });
    await expect(parseBackupBytes(new TextEncoder().encode('{"sources": 5}'))).rejects.toMatchObject({ code: 'RST-002' });
  });
});

describe('şifreleme yardımcıları', () => {
  it('gidiş-dönüş', async () => {
    const data = new TextEncoder().encode('NexLearn');
    const enc = await encryptBytes(data, 'p', 20_000);
    expect(new TextDecoder().decode(await decryptBytes(enc, 'p'))).toBe('NexLearn');
  });
});
