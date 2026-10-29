import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { applyPack, exportPack, listPublishedPacks, packStatus, parsePack } from '../services/pack';
import { importFile, getSegments, listSources } from '../services/sources';
import { createCard, listCards, recordReview, updateCard } from '../services/memory';
import { createConcept, createRelation, listConcepts, listRelations, trashConcept } from '../services/learn';
import { createSegmentAnnotation, listAnnotationsForSource as listAnnotations } from '../services/annotations';
import { getDb } from '../adapters/storage/db';
import { isAppError } from '../domain/errors';

async function seedPublisher() {
  const r = await importFile({ name: 'ağlar.md', bytes: new TextEncoder().encode('# Ağlar\n\nTCP güvenilirdir.\n\nUDP hızlıdır.') });
  if (r.status !== 'imported') throw new Error();
  const segs = await getSegments(r.source.id);
  const tcp = await createConcept({ label: 'TCP', sourceRefs: [{ sourceId: r.source.id, segmentId: segs[1].id }] });
  const udp = await createConcept({ label: 'UDP', sourceRefs: [{ sourceId: r.source.id, segmentId: segs[2].id }] });
  await createRelation({ fromConceptId: tcp.id, toConceptId: udp.id, relationType: 'contrasts_with' });
  const card = await createCard({ prompt: 'TCP nasıldır?', answer: 'Güvenilir', sourceRefs: [{ sourceId: r.source.id, segmentId: segs[1].id }], conceptIds: [tcp.id] });
  await createSegmentAnnotation('note', segs[1], { noteText: 'Yayıncı notu' });
  await recordReview(card.id, 'good');
  return { source: r.source, segs, tcp, udp, card };
}

async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    expect(isAppError(e) && e.code).toBe(code);
    return;
  }
  throw new Error('hata bekleniyordu');
}

describe('.nexpack paylaşım paketi', () => {
  it('dışa aktar → içe aktar: kimlikler yeniden eşlenir, kişisel veri pakete girmez', async () => {
    const pub = await seedPublisher();
    const { bytes, fileName, manifest } = await exportPack({ title: 'Ağlar 101', kind: 'study', sourceIds: [pub.source.id], includeCards: true, includeConcepts: true, includeNotes: true, includeOriginals: true });
    expect(fileName).toBe('aglar-101-v1.nexpack');
    expect(manifest.counts).toMatchObject({ sources: 1, concepts: 2, relations: 1, items: 1, annotations: 1 });
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(['content.json', 'files/' + pub.source.id + '.md', 'manifest.json'].sort());
    const text = new TextDecoder().decode(entries['content.json']);
    expect(text).not.toContain('reviewStates');
    expect(text).not.toContain('easeFactor');

    const parsed = await parsePack(bytes);
    expect(await packStatus(parsed.manifest)).toEqual({ installed: null, action: 'install' });
    const res = await applyPack(parsed);
    expect(res.created).toBe(6);

    const sources = await listSources();
    expect(sources).toHaveLength(2);
    const copy = sources.find((s) => s.pack)!;
    expect(copy.id).not.toBe(pub.source.id);
    expect(copy.pack).toMatchObject({ id: manifest.packId, itemId: pub.source.id, version: 1 });
    const copySegs = await getSegments(copy.id);
    expect(copySegs.map((s) => s.text)).toEqual(pub.segs.map((s) => s.text));
    expect(copySegs.every((s) => !pub.segs.some((p) => p.id === s.id))).toBe(true);

    const cards = (await listCards()).filter((c) => c.pack);
    expect(cards).toHaveLength(1);
    expect(cards[0].provenance).toBe('imported');
    expect(cards[0].sourceRefs[0]).toEqual({ sourceId: copy.id, segmentId: copySegs[1].id });
    const concepts = (await listConcepts()).filter((c) => c.pack);
    expect(cards[0].conceptIds).toEqual([concepts.find((c) => c.label === 'TCP')!.id]);
    const rel = (await listRelations()).find((r) => r.pack)!;
    expect(new Set([rel.fromConceptId, rel.toConceptId])).toEqual(new Set(concepts.map((c) => c.id)));

    const db = await getDb();
    const state = await db.get('reviewStates', cards[0].id);
    expect(state?.repetitionCount).toBe(0);
    const file = await db.get('files', copy.storageRef!);
    expect(await file!.blob.text()).toContain('TCP güvenilirdir.');
    expect(await packStatus(parsed.manifest)).toEqual({ installed: { version: 1 }, action: 'same' });
  });

  it('kurumsal bilgi tabanı: yeni sürüm yerel kopyayı günceller, kişisel plan ve vurgular korunur', async () => {
    const pub = await seedPublisher();
    const v1 = await exportPack({ title: 'Kılavuz', kind: 'knowledge', sourceIds: [pub.source.id], includeCards: true, includeConcepts: true, includeNotes: false, includeOriginals: false });
    await applyPack(await parsePack(v1.bytes));
    const copy = (await listSources()).find((s) => s.pack)!;
    const copySegs = await getSegments(copy.id);
    const copyCard = (await listCards()).find((c) => c.pack)!;
    // Alıcı kopyada çalışır: kişisel tekrar ve kendi vurgusu
    await recordReview(copyCard.id, 'easy');
    const mine = await createSegmentAnnotation('highlight', copySegs[1], { color: 'important' });

    // Yayıncı içeriği değiştirir ve aynı paketi yeniden yayımlar
    await updateCard(pub.card.id, { prompt: 'TCP nasıldır?', answer: 'Güvenilir ve sıralı', sourceRefs: pub.card.sourceRefs, conceptIds: [pub.tcp.id] });
    await trashConcept(pub.udp.id);
    const published = await listPublishedPacks();
    expect(published).toHaveLength(1);
    const v2 = await exportPack({ title: 'Kılavuz', kind: 'knowledge', sourceIds: [pub.source.id], includeCards: true, includeConcepts: true, includeNotes: false, includeOriginals: false, packId: published[0].packId });
    expect(v2.manifest.packId).toBe(v1.manifest.packId);
    expect(v2.manifest.version).toBe(2);

    const parsed2 = await parsePack(v2.bytes);
    expect((await packStatus(parsed2.manifest)).action).toBe('update');
    const res = await applyPack(parsed2);
    expect(res.removed).toBe(2); // UDP kavramı ve ona bağlı ilişki

    const updated = (await listCards()).find((c) => c.pack)!;
    expect(updated.id).toBe(copyCard.id);
    expect(updated.answer).toBe('Güvenilir ve sıralı');
    expect(updated.pack?.version).toBe(2);
    const db = await getDb();
    expect((await db.get('reviewStates', updated.id))?.repetitionCount).toBe(1);
    expect((await listConcepts()).filter((c) => c.pack).map((c) => c.label)).toEqual(['TCP']);
    // Kullanıcının vurgusu aynı segmente bağlı kalır
    const segsAfter = await getSegments(copy.id);
    const ann = (await listAnnotations(copy.id)).find((a) => a.id === mine.id)!;
    expect(segsAfter.some((s) => s.id === ann.segmentId)).toBe(true);
    expect((await listSources()).filter((s) => s.pack)).toHaveLength(1);
  });

  it('kurcalanmış ya da zararlı paketler reddedilir', async () => {
    const pub = await seedPublisher();
    const { bytes } = await exportPack({ title: 'X', kind: 'study', sourceIds: [pub.source.id], includeCards: true, includeConcepts: false, includeNotes: false, includeOriginals: false });
    const entries = unzipSync(bytes);
    const tampered = zipSync({ ...entries, 'content.json': strToU8(new TextDecoder().decode(entries['content.json']).replace('Güvenilir', 'Kötü')) });
    await expectCode(parsePack(tampered), 'PCK-001');

    const traversal = zipSync({ ...entries, '../evil.txt': strToU8('x') });
    await expect(parsePack(traversal)).resolves.toBeTruthy(); // tehlikeli yol yok sayılır, hiçbir yere yazılmaz

    const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
    const newer = zipSync({ ...entries, 'manifest.json': strToU8(JSON.stringify({ ...manifest, formatVersion: 99 })) });
    await expectCode(parsePack(newer), 'PCK-002');
    await expectCode(parsePack(strToU8('rastgele')), 'PCK-001');
  });
});
