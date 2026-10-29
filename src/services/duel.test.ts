import { describe, expect, it } from 'vitest';
import { answerChallenge, createChallenge, loadDuels, parseDuelFile, receiveDuelFile } from './duel';
import { createCard, listCards } from './memory';
import { isAppError } from '../domain/errors';
import { getDb } from '../adapters/storage/db';

describe('eşli öğrenme (meydan okuma)', () => {
  it('meydan okuma → cevap → karşılaştırma; tekrar planı değişmez', async () => {
    await createCard({ prompt: 'TCP?', answer: 'Güvenilir' });
    await createCard({ prompt: 'UDP?', answer: 'Hızlı' });
    const items = await listCards();
    const db = await getDb();
    const statesBefore = await db.getAll('reviewStates');

    const { bytes, fileName, challenge } = await createChallenge(items, { title: 'Ağ düellosu', from: 'Ayşe' });
    expect(fileName).toBe('ag-duellosu.nexduel');
    expect(challenge.questions).toHaveLength(2);

    // Karşı taraf: aynı uygulamada "alınan" olarak simüle edilir
    const sentOnly = await loadDuels();
    await db.put('meta', { key: 'duels', value: JSON.stringify({ sent: [], received: [] }) });
    const r1 = await receiveDuelFile(bytes);
    expect(r1).toEqual({ kind: 'challenge', challengeId: challenge.challengeId, matched: true });
    const ans = await answerChallenge(challenge.challengeId, [
      { id: 'q1', typed: 'güvenilir', grade: 'knew' },
      { id: 'q2', typed: '', grade: 'partial' },
    ], 'Mehmet');
    expect(ans.fileName).toBe('ag-duellosu.nexduel-cevap');
    expect(ans.answer.score).toBe(75);

    // Gönderen tarafa dön ve cevabı al
    await db.put('meta', { key: 'duels', value: JSON.stringify(sentOnly) });
    const r2 = await receiveDuelFile(ans.bytes);
    expect(r2.matched).toBe(true);
    const store = await loadDuels();
    expect(store.sent[0].answers.map((a) => [a.by, a.score])).toEqual([['Mehmet', 75]]);
    expect(await db.getAll('reviewStates')).toEqual(statesBefore);
  });

  it('kurcalanmış puan yok sayılır, bozuk dosyalar reddedilir', () => {
    const fake = { format: 'nexduel-answer', formatVersion: 1, challengeId: 'duel_x', title: 'T', by: 'B', answeredAt: '', results: [{ id: 'q1', typed: '', grade: 'missed' }], score: 100 };
    const p = parseDuelFile(new TextEncoder().encode(JSON.stringify(fake)));
    expect(p.kind === 'answer' && p.value.score).toBe(0);
    for (const bad of ['{}', 'yok', JSON.stringify({ ...fake, challengeId: '../x' }), JSON.stringify({ ...fake, results: [{ id: 'q1', grade: 'hack' }] })]) {
      try {
        parseDuelFile(new TextEncoder().encode(bad));
        throw new Error('reddedilmeliydi');
      } catch (e) {
        expect(isAppError(e) && e.code).toBe('PCK-001');
      }
    }
  });
});
