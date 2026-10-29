import { emitChange, getDb } from '../adapters/storage/db';
import { AppError } from '../domain/errors';
import { newId, nowIso } from '../domain/ids';
import type { LearningItem } from '../domain/types';
import { summarizePractice, type PracticeGrade } from './practice';

/**
 * Eşli öğrenme (meydan okuma). Sunucu yok: dosyalar elden ele dolaşır (e-posta, NexAktar, USB…).
 * 1) A kartlarından bir soru seti seçer → `.nexduel` dosyası.
 * 2) B dosyayı açar, cevaplar, kendini puanlar → `.nexduel-cevap` dosyası.
 * 3) A cevap dosyasını açar → kimin neyi bildiğini yan yana görür.
 * Kişisel tekrar planı hiçbir aşamada değişmez. Cevaplar dosyada açıktır: bu bir güven oyunudur, sınav değil.
 */
export const DUEL_FORMAT = 'nexduel';
export const DUEL_ANSWER_FORMAT = 'nexduel-answer';
const MAX_QUESTIONS = 100;
const MAX_TEXT = 4000;

export interface DuelQuestion {
  id: string;
  prompt: string;
  answer: string;
}

export interface DuelChallenge {
  format: typeof DUEL_FORMAT;
  formatVersion: 1;
  challengeId: string;
  title: string;
  from: string;
  createdAt: string;
  questions: DuelQuestion[];
}

export interface DuelResultRow {
  id: string;
  typed: string;
  grade: PracticeGrade;
}

export interface DuelAnswer {
  format: typeof DUEL_ANSWER_FORMAT;
  formatVersion: 1;
  challengeId: string;
  title: string;
  by: string;
  answeredAt: string;
  results: DuelResultRow[];
  score: number;
}

export interface DuelStore {
  sent: (DuelChallenge & { answers: DuelAnswer[]; myResults?: DuelResultRow[] })[];
  received: (DuelChallenge & { myAnswer?: DuelAnswer })[];
}

const KEY = 'duels';

export async function loadDuels(): Promise<DuelStore> {
  const db = await getDb();
  const rec = await db.get('meta', KEY);
  try {
    const v = rec ? (JSON.parse(rec.value) as DuelStore) : null;
    return { sent: Array.isArray(v?.sent) ? v.sent : [], received: Array.isArray(v?.received) ? v.received : [] };
  } catch {
    return { sent: [], received: [] };
  }
}

async function saveDuels(s: DuelStore): Promise<void> {
  const db = await getDb();
  await db.put('meta', { key: KEY, value: JSON.stringify(s) });
  emitChange(['meta']);
}

function fileSlug(title: string): string {
  const tr: Record<string, string> = { ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c' };
  return (
    title
      .toLocaleLowerCase('tr')
      .replace(/[ğüşıöç]/g, (c) => tr[c] ?? c)
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'meydan-okuma'
  );
}

const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v, null, 1));

export async function createChallenge(items: LearningItem[], opts: { title: string; from: string; now?: Date }): Promise<{ bytes: Uint8Array; fileName: string; challenge: DuelChallenge }> {
  const title = opts.title.trim();
  if (!title) throw new AppError('VAL-001', 'title');
  if (!items.length) throw new AppError('VAL-001', 'questions');
  const challenge: DuelChallenge = {
    format: DUEL_FORMAT,
    formatVersion: 1,
    challengeId: newId('duel'),
    title: title.slice(0, 200),
    from: opts.from.trim().slice(0, 80),
    createdAt: nowIso(opts.now),
    questions: items.slice(0, MAX_QUESTIONS).map((i, n) => ({ id: `q${n + 1}`, prompt: i.prompt.slice(0, MAX_TEXT), answer: i.answer.slice(0, MAX_TEXT) })),
  };
  const store = await loadDuels();
  store.sent.unshift({ ...challenge, answers: [] });
  await saveDuels(store);
  return { bytes: encode(challenge), fileName: `${fileSlug(title)}.nexduel`, challenge };
}

export function looksLikeDuel(name: string): boolean {
  return /\.nexduel(-cevap)?$/i.test(name);
}

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/** Meydan okuma ya da cevap dosyasını doğrular. */
export function parseDuelFile(bytes: Uint8Array): { kind: 'challenge'; value: DuelChallenge } | { kind: 'answer'; value: DuelAnswer } {
  if (bytes.length > 2 * 1024 * 1024) throw new AppError('PCK-001', 'duel-size');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    throw new AppError('PCK-001', 'duel-json');
  }
  if (!raw || typeof raw !== 'object') throw new AppError('PCK-001', 'duel-shape');
  if (typeof raw.formatVersion === 'number' && raw.formatVersion > 1) throw new AppError('PCK-002');
  if (!isStr(raw.challengeId, 64) || !/^[A-Za-z0-9_-]+$/.test(raw.challengeId) || !isStr(raw.title, 200)) throw new AppError('PCK-001', 'duel-id');
  if (raw.format === DUEL_FORMAT) {
    const qs = raw.questions;
    if (!Array.isArray(qs) || qs.length === 0 || qs.length > MAX_QUESTIONS) throw new AppError('PCK-001', 'duel-questions');
    for (const q of qs as Record<string, unknown>[]) {
      if (!q || !isStr(q.id, 16) || !isStr(q.prompt, MAX_TEXT) || !isStr(q.answer, MAX_TEXT)) throw new AppError('PCK-001', 'duel-question');
    }
    return {
      kind: 'challenge',
      value: {
        format: DUEL_FORMAT,
        formatVersion: 1,
        challengeId: raw.challengeId,
        title: raw.title,
        from: isStr(raw.from, 80) ? raw.from : '',
        createdAt: isStr(raw.createdAt, 40) ? raw.createdAt : '',
        questions: (qs as DuelQuestion[]).map((q) => ({ id: q.id, prompt: q.prompt, answer: q.answer })),
      },
    };
  }
  if (raw.format === DUEL_ANSWER_FORMAT) {
    const rs = raw.results;
    if (!Array.isArray(rs) || rs.length > MAX_QUESTIONS) throw new AppError('PCK-001', 'duel-results');
    for (const r of rs as Record<string, unknown>[]) {
      if (!r || !isStr(r.id, 16) || !isStr(r.typed ?? '', MAX_TEXT) || !['knew', 'partial', 'missed'].includes(String(r.grade))) throw new AppError('PCK-001', 'duel-result');
    }
    const results = (rs as DuelResultRow[]).map((r) => ({ id: r.id, typed: r.typed ?? '', grade: r.grade }));
    return {
      kind: 'answer',
      value: {
        format: DUEL_ANSWER_FORMAT,
        formatVersion: 1,
        challengeId: raw.challengeId,
        title: raw.title,
        by: isStr(raw.by, 80) ? raw.by : '',
        answeredAt: isStr(raw.answeredAt, 40) ? raw.answeredAt : '',
        results,
        // Puan dosyadan değil, sonuçlardan yeniden hesaplanır.
        score: summarizePractice(results.map((r) => r.grade)).score,
      },
    };
  }
  throw new AppError('PCK-001', 'duel-format');
}

/** Gelen dosyayı kaydeder. Cevap dosyası, karşılık gelen gönderilmiş meydan okumaya eklenir. */
export async function receiveDuelFile(bytes: Uint8Array): Promise<{ kind: 'challenge' | 'answer'; challengeId: string; matched: boolean }> {
  const parsed = parseDuelFile(bytes);
  const store = await loadDuels();
  if (parsed.kind === 'challenge') {
    const c = parsed.value;
    if (!store.received.some((r) => r.challengeId === c.challengeId) && !store.sent.some((s) => s.challengeId === c.challengeId)) store.received.unshift(c);
    await saveDuels(store);
    return { kind: 'challenge', challengeId: c.challengeId, matched: true };
  }
  const a = parsed.value;
  const sent = store.sent.find((s) => s.challengeId === a.challengeId);
  if (!sent) return { kind: 'answer', challengeId: a.challengeId, matched: false };
  sent.answers = [...sent.answers.filter((x) => !(x.by === a.by && x.answeredAt === a.answeredAt)), a];
  await saveDuels(store);
  return { kind: 'answer', challengeId: a.challengeId, matched: true };
}

/** Alınan meydan okumayı cevaplar; cevap dosyasını üretir. */
export async function answerChallenge(challengeId: string, results: DuelResultRow[], by: string, now?: Date): Promise<{ bytes: Uint8Array; fileName: string; answer: DuelAnswer }> {
  const store = await loadDuels();
  const rec = store.received.find((r) => r.challengeId === challengeId);
  if (!rec) throw new AppError('DB-004', 'duel');
  const answer: DuelAnswer = {
    format: DUEL_ANSWER_FORMAT,
    formatVersion: 1,
    challengeId,
    title: rec.title,
    by: by.trim().slice(0, 80),
    answeredAt: nowIso(now),
    results: results.map((r) => ({ id: r.id, typed: r.typed.slice(0, MAX_TEXT), grade: r.grade })),
    score: summarizePractice(results.map((r) => r.grade)).score,
  };
  rec.myAnswer = answer;
  await saveDuels(store);
  return { bytes: encode(answer), fileName: `${fileSlug(rec.title)}.nexduel-cevap`, answer };
}

/** Gönderen de kendi setini çözebilir; sonuçları karşılaştırmada gösterilir. */
export async function saveOwnResults(challengeId: string, results: DuelResultRow[]): Promise<void> {
  const store = await loadDuels();
  const rec = store.sent.find((s) => s.challengeId === challengeId);
  if (!rec) throw new AppError('DB-004', 'duel');
  rec.myResults = results;
  await saveDuels(store);
}

export async function removeDuel(challengeId: string): Promise<void> {
  const store = await loadDuels();
  await saveDuels({ sent: store.sent.filter((s) => s.challengeId !== challengeId), received: store.received.filter((s) => s.challengeId !== challengeId) });
}
