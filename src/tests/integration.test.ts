import { describe, expect, it } from 'vitest';
import { importFile, getSegments, createTextSource, listSources, trashSource, purgeSource, retryImport, recoverInterruptedImports, updateNoteBody } from '../services/sources';
import { createRangeAnnotations, createSegmentAnnotation, listAnnotationsForSource, extractTags, toggleBookmark } from '../services/annotations';
import { checkCardQuality, createCard, getDueQueue, listReviewEvents, listReviewStates, recordReview, trashCard, purgeCard } from '../services/memory';
import { conceptImpact, createConcept, createRelation, createTask, addTaskAttempt, listRelations, trashConcept, listConcepts } from '../services/learn';
import { getSettings, updateSettings } from '../services/settings';
import { saveReadingPosition, progressPercent, getReadingState } from '../services/reading';
import { updateEntity } from '../adapters/storage/repo';
import { getDb } from '../adapters/storage/db';

const file = (name: string, text: string) => ({ name, bytes: new TextEncoder().encode(text) });

describe('kaynak içe aktarma → okuma → not → kart → tekrar', () => {
  it('TXT içe aktarılır, orijinal dosya saklanır, segmentler oluşur', async () => {
    const res = await importFile(file('ağ notları.txt', 'TCP güvenilirdir.\n\nUDP bağlantısızdır.'));
    expect(res.status).toBe('imported');
    if (res.status !== 'imported') return;
    expect(res.source.processingStatus).toBe('ready');
    expect(res.source.segmentCount).toBe(2);
    expect(res.source.wordCount).toBe(4);
    expect(res.source.title).toBe('ağ notları');
    const db = await getDb();
    const f = await db.get('files', res.source.storageRef!);
    expect(new TextDecoder().decode(new Uint8Array(await f!.blob.arrayBuffer()))).toContain('TCP');
  });

  it('aynı içerik tekrar eklenirse sorulur; reddedilirse eklenmez, otomatik silme yok', async () => {
    await importFile(file('a.txt', 'Aynı içerik burada.'));
    const r = await importFile(file('b.txt', 'Aynı içerik burada.'), { confirmDuplicate: async () => false });
    expect(r.status).toBe('skipped-duplicate');
    const r2 = await importFile(file('c.txt', 'Aynı içerik burada.'), { confirmDuplicate: async () => true });
    expect(r2.status).toBe('imported');
    expect(await listSources()).toHaveLength(2);
  });

  it('boş/anlamsız içerik "empty" durumu alır', async () => {
    const r = await importFile(file('bos.txt', ' ... --- '));
    expect(r.status === 'imported' && r.source.processingStatus).toBe('empty');
  });

  it('desteklenmeyen ve arşiv dosyaları açık hata verir', async () => {
    await expect(importFile(file('x.docx', 'abc'))).rejects.toMatchObject({ code: 'SRC-001' });
    await expect(importFile({ name: 'x.zip', bytes: new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]) })).rejects.toMatchObject({ code: 'SRC-005' });
  });

  it('iptal edilen içe aktarma "kısmi" işaretlenir ve yeniden denenebilir', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(importFile(file('i.txt', 'Metin.'), { signal: ctrl.signal })).rejects.toMatchObject({ code: 'SRC-006' });
    // Kapanma senaryosu: "processing" kalan kaynak açılışta "partial" olur.
    const r = await importFile(file('j.txt', 'Bir paragraf.'));
    if (r.status !== 'imported') throw new Error();
    await updateEntity('sources', r.source.id, { processingStatus: 'processing' });
    expect(await recoverInterruptedImports()).toBe(1);
    const again = await retryImport(r.source.id);
    expect(again.processingStatus).toBe('ready');
  });

  it('Markdown → vurgu (çok segmentli) → not → kart → tekrar olayı', async () => {
    const r = await importFile(file('tcp.md', '# TCP\n\nTCP üç yönlü el sıkışma kullanır.\n\nSYN, SYN-ACK, ACK.'));
    if (r.status !== 'imported') throw new Error();
    const segs = await getSegments(r.source.id);
    expect(segs[0].segmentType).toBe('heading');
    const anns = await createRangeAnnotations('highlight', [
      { segment: segs[1], start: 4, end: 20 },
      { segment: segs[2], start: 0, end: 3 },
    ], { color: 'definition', noteText: 'Önemli #ağ' });
    expect(anns).toHaveLength(2);
    expect(anns[0].groupId).toBe(anns[1].groupId);
    expect(anns[0].selectedText).toBe('üç yönlü el sıkı');
    expect(anns[0].tags).toEqual(['ağ']);
    await createSegmentAnnotation('note', segs[2], { noteText: 'Bayraklar' });
    expect(await toggleBookmark(segs[1])).toBe(true);
    expect(await listAnnotationsForSource(r.source.id)).toHaveLength(4);
    expect(await toggleBookmark(segs[1])).toBe(false);

    const now = new Date('2026-03-10T08:00:00Z');
    const card = await createCard(
      { prompt: 'TCP kaç adımlı el sıkışma kullanır?', answer: 'Üç', sourceRefs: [{ sourceId: r.source.id, segmentId: segs[1].id }] },
      { now },
    );
    const queue = await getDueQueue(now);
    expect(queue.map((q) => q.item.id)).toContain(card.id);
    const res = await recordReview(card.id, 'good', { now });
    expect(res.state.intervalDays).toBe(1);
    expect(res.reason.key).toBe('firstSuccess');
    expect(res.event.scheduleBefore.repetitionCount).toBe(0);
    expect(res.event.answerText).toBeUndefined();
    expect(await getDueQueue(now)).toHaveLength(0);
    expect(await listReviewEvents(card.id)).toHaveLength(1);
  });

  it('askıya alınmış ve silinmiş kartlar kuyruğa girmez; kalıcı silme tekrar verisini temizler', async () => {
    const now = new Date();
    const a = await createCard({ prompt: 'S1', answer: 'C1' }, { now });
    const b = await createCard({ prompt: 'S2', answer: 'C2' }, { now });
    await updateEntity('items', a.id, { suspended: true });
    await trashCard(b.id);
    expect(await getDueQueue(now)).toHaveLength(0);
    await purgeCard(b.id);
    expect((await listReviewStates()).has(b.id)).toBe(false);
  });

  it('kart kalite uyarıları', async () => {
    const existing = await createCard({ prompt: 'TCP nedir?', answer: 'Protokol' });
    expect(checkCardQuality({ prompt: 'tcp NEDİR?', answer: 'x'.repeat(400) }, [existing])).toEqual(['longAnswer', 'duplicatePrompt', 'noSource']);
    await expect(createCard({ prompt: '  ', answer: 'a' })).rejects.toMatchObject({ code: 'VAL-001' });
  });

  it('okuma konumu kalıcı ve ilerleme en ileri konuma göre', async () => {
    await saveReadingPosition('src_x', 5);
    await saveReadingPosition('src_x', 2);
    const st = await getReadingState('src_x');
    expect(st?.segmentIndex).toBe(2);
    expect(progressPercent(st, 10)).toBe(60);
  });

  it('not kaynağı düzenlenince aynı metinli segmentler kimliğini korur', async () => {
    const s = await createTextSource('note', 'Fikir', 'Birinci paragraf.\n\nİkinci paragraf.');
    const before = await getSegments(s.id);
    await updateNoteBody(s.id, 'Fikir', 'Birinci paragraf.\n\nYeni ikinci.');
    const after = await getSegments(s.id);
    expect(after[0].id).toBe(before[0].id);
    expect(after[1].id).not.toBe(before[1].id);
  });

  it('çöp kutusu ve kalıcı silme: kartlar korunur', async () => {
    const r = await importFile(file('k.txt', 'Kalıcı silme testi.'));
    if (r.status !== 'imported') throw new Error();
    const segs = await getSegments(r.source.id);
    await createSegmentAnnotation('note', segs[0], { noteText: 'n' });
    const card = await createCard({ prompt: 'q', answer: 'a', sourceRefs: [{ sourceId: r.source.id }] });
    await trashSource(r.source.id);
    expect(await listSources()).toHaveLength(0);
    await purgeSource(r.source.id);
    expect(await getSegments(r.source.id)).toHaveLength(0);
    expect(await listAnnotationsForSource(r.source.id)).toHaveLength(0);
    const db = await getDb();
    expect(await db.get('items', card.id)).toBeTruthy();
  });
});

describe('NexÖğren', () => {
  it('kavram, ilişki kuralları, silmede kontrollü bağlantı temizliği', async () => {
    const tcp = await createConcept({ label: 'TCP' });
    const ip = await createConcept({ label: 'IP' });
    const hs = await createConcept({ label: 'El sıkışma' });
    await createRelation({ fromConceptId: ip.id, toConceptId: tcp.id, relationType: 'prerequisite_of' });
    await createRelation({ fromConceptId: hs.id, toConceptId: tcp.id, relationType: 'part_of' });
    await expect(createRelation({ fromConceptId: tcp.id, toConceptId: ip.id, relationType: 'prerequisite_of' })).rejects.toMatchObject({ code: 'REL-002' });
    const card = await createCard({ prompt: 'q', answer: 'a', conceptIds: [tcp.id] });
    const task = await createTask({ prompt: 'Bir TCP oturumunu çiz', conceptIds: [tcp.id] });
    expect(await conceptImpact(tcp.id)).toEqual({ relations: 2, cards: 1, tasks: 1 });
    await trashConcept(tcp.id);
    expect(await listRelations()).toHaveLength(0);
    expect((await listConcepts()).map((c) => c.label).sort()).toEqual(['El sıkışma', 'IP']);
    const db = await getDb();
    expect((await db.get('items', card.id))!.conceptIds).toEqual([]);
    expect((await db.get('tasks', task.id))!.conceptIds).toEqual([]);
  });

  it('uygulama görevi denemeleri', async () => {
    const t = await createTask({ prompt: 'Görev' });
    await addTaskAttempt(t.id, 'Yaptım', 'done');
    const db = await getDb();
    expect((await db.get('tasks', t.id))!.attempts).toHaveLength(1);
    await expect(addTaskAttempt(t.id, ' ', 'done')).rejects.toMatchObject({ code: 'VAL-001' });
  });
});

describe('ayarlar ve çakışma', () => {
  it('ayarlar sınırlar içinde tutulur ve kalıcıdır', async () => {
    expect((await getSettings()).theme).toBe('system');
    await updateSettings({ fontSizePx: 999, theme: 'gece' });
    const s = await getSettings();
    expect(s.fontSizePx).toBe(32);
    expect(s.theme).toBe('gece');
  });
  it('beklenen sürüm farklıysa DB-003 çakışması', async () => {
    const c = await createConcept({ label: 'X' });
    await updateEntity('concepts', c.id, { description: 'a' });
    await expect(updateEntity('concepts', c.id, { description: 'b' }, 1)).rejects.toMatchObject({ code: 'DB-003' });
  });
  it('etiket çıkarımı', () => {
    expect(extractTags('#Ağ ve #kuantum_fizik ama e#posta değil')).toEqual(['ağ', 'kuantum_fizik']);
  });
});
