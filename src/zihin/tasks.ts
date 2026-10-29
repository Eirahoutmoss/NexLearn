import { AppError } from '../domain/errors';
import type { ChatMessage, ModelProvider } from './engine';

/**
 * Zihin görevleri: istem (prompt) kurma + çıktıyı doğrulama. Model çıktısı asla doğrudan
 * kaydedilmez; kullanıcı her öneriyi görüp onaylar. Öneriler "otomatik" kökenle işaretlenir.
 */
export type Lang = 'tr' | 'en';
const MAX_INPUT_CHARS = 3500;

const SYSTEM: Record<Lang, string> = {
  tr: 'Sen NexLearn içindeki yardımcı bir öğretmensin. Yalnızca verilen metne dayanırsın; metinde olmayan bilgiyi uydurmazsın. Kısa, açık ve Türkçe yazarsın.',
  en: 'You are a helpful tutor inside NexLearn. You rely only on the given text and never invent facts that are not in it. You write short, clear English.',
};

function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > MAX_INPUT_CHARS ? `${t.slice(0, MAX_INPUT_CHARS)}…` : t;
}

/* ---------- Kart önerileri ---------- */

export interface CardSuggestion {
  question: string;
  answer: string;
}

export const CARD_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        properties: { question: { type: 'string', minLength: 5, maxLength: 200 }, answer: { type: 'string', minLength: 1, maxLength: 300 } },
        required: ['question', 'answer'],
      },
    },
  },
  required: ['cards'],
};

export function cardMessages(text: string, lang: Lang): ChatMessage[] {
  // İçeriksiz bir biçim örneği: küçük modeller somut örnekleri kopyalamaya eğilimlidir.
  const example = '{"cards":[{"question":"…?","answer":"…"}]}';
  const ask =
    lang === 'tr'
      ? `Aşağıdaki METİN'den en önemli bilgileri yoklayan 2-4 soru-cevap kartı üret. Kurallar: her soru soru işaretiyle biten tam bir soru cümlesidir ve tek bir bilgiyi sorar; cevap 1-8 kelimelik kısa bir ifadedir ve metinden çıkar; başlıkları soru yapma.\nBiçim: ${example}\n\nMETİN:\n${clip(text)}\n\nÇIKTI (yalnızca JSON):`
      : `Create 2-4 question-answer flashcards that test the most important facts in the TEXT below. Rules: each question is a full sentence ending with a question mark and asks for one fact; the answer is a short 1-8 word phrase taken from the text; do not turn headings into questions.\nFormat: ${example}\n\nTEXT:\n${clip(text)}\n\nOUTPUT (JSON only):`;
  return [
    { role: 'system', content: SYSTEM[lang] },
    { role: 'user', content: ask },
  ];
}

/** Model çıktısını doğrular; bozuk, boş, tekrarlı ya da metinle ilgisiz önerileri atar. */
export function parseCards(raw: string, sourceText: string): CardSuggestion[] {
  const json = extractJson(raw);
  const list = (json as { cards?: unknown })?.cards;
  if (!Array.isArray(list)) throw new AppError('ZHN-006', 'shape');
  const source = sourceText.toLocaleLowerCase('tr');
  const seen = new Set<string>();
  const out: CardSuggestion[] = [];
  for (const c of list as Record<string, unknown>[]) {
    const q = typeof c?.question === 'string' ? c.question.trim().slice(0, 200) : '';
    const a = typeof c?.answer === 'string' ? c.answer.trim().slice(0, 300) : '';
    if (q.length < 8 || !a || !q.includes('?')) continue;
    if (a.toLocaleLowerCase('tr') === q.toLocaleLowerCase('tr').replace(/\?$/, '').trim()) continue;
    const key = q.toLocaleLowerCase('tr');
    if (seen.has(key)) continue;
    // Uydurmaya karşı güvence: cevabın anlamlı kelimelerinin en az yarısı (kök olarak) kaynakta geçmeli.
    const words = a.toLocaleLowerCase('tr').match(/[\p{L}\p{N}]{3,}/gu) ?? [];
    const found = words.filter((w) => source.includes(w.slice(0, Math.max(3, Math.min(w.length, Math.ceil(w.length * 0.7)))))).length;
    if (words.length && found / words.length < 0.5) continue;
    seen.add(key);
    out.push({ question: q, answer: a });
  }
  if (!out.length) throw new AppError('ZHN-006', 'empty');
  return out.slice(0, 4);
}

export async function suggestCards(provider: ModelProvider, text: string, lang: Lang, signal?: AbortSignal): Promise<CardSuggestion[]> {
  const raw = await provider.generate(cardMessages(text, lang), { jsonSchema: CARD_SCHEMA, maxTokens: 600, temperature: 0.2, signal });
  return parseCards(raw, text);
}

/* ---------- Basitçe açıkla ---------- */

export function simplifyMessages(text: string, lang: Lang): ChatMessage[] {
  const ask =
    lang === 'tr'
      ? `Aşağıdaki metni hiç bilmeyen birine 3-5 kısa cümleyle, günlük dille açıkla. Gerekirse bir örnek ver. Metinde olmayan bilgi ekleme.\n\nMETİN:\n${clip(text)}`
      : `Explain the text below to someone with no background in 3-5 short sentences of everyday language. Give one example if helpful. Do not add facts that are not in the text.\n\nTEXT:\n${clip(text)}`;
  return [
    { role: 'system', content: SYSTEM[lang] },
    { role: 'user', content: ask },
  ];
}

export async function simplify(provider: ModelProvider, text: string, lang: Lang, opts: { signal?: AbortSignal; onToken?: (t: string) => void } = {}): Promise<string> {
  const out = (await provider.generate(simplifyMessages(text, lang), { maxTokens: 320, temperature: 0.4, ...opts })).trim();
  if (!out) throw new AppError('ZHN-006', 'empty');
  return out.slice(0, 2000);
}

/* ---------- Anlatımı değerlendir (Feynman) ---------- */

export interface ExplanationReview {
  verdict: 'good' | 'partial' | 'off';
  missing: string[];
  wrong: string[];
  tip: string;
}

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['good', 'partial', 'off'] },
    missing: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 120 } },
    wrong: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 160 } },
    tip: { type: 'string', maxLength: 240 },
  },
  required: ['verdict', 'missing', 'wrong', 'tip'],
};

export function reviewMessages(source: string, explanation: string, lang: Lang): ChatMessage[] {
  const ask =
    lang === 'tr'
      ? `KAYNAK metni ve öğrencinin kendi cümleleriyle yaptığı ANLATIM'ı karşılaştır. Anlatım kaynağa göre doğru ve yeterli mi? Eksik kalan önemli noktaları ve varsa yanlışları kısa maddeler hâlinde yaz, bir de tek cümlelik öneri ver. Yalnızca JSON döndür.\n\nKAYNAK:\n${clip(source)}\n\nANLATIM:\n${clip(explanation)}`
      : `Compare the SOURCE text with the student's own EXPLANATION. Is it correct and sufficient according to the source? List missing key points and any mistakes as short items, and give a one-sentence tip. Return JSON only.\n\nSOURCE:\n${clip(source)}\n\nEXPLANATION:\n${clip(explanation)}`;
  return [
    { role: 'system', content: SYSTEM[lang] },
    { role: 'user', content: ask },
  ];
}

export function parseReview(raw: string): ExplanationReview {
  const j = extractJson(raw) as Record<string, unknown>;
  const verdict = j?.verdict === 'good' || j?.verdict === 'partial' || j?.verdict === 'off' ? j.verdict : null;
  if (!verdict) throw new AppError('ZHN-006', 'verdict');
  const strs = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, len)).slice(0, n) : []);
  return { verdict, missing: strs(j.missing, 4, 120), wrong: strs(j.wrong, 3, 160), tip: typeof j.tip === 'string' ? j.tip.trim().slice(0, 240) : '' };
}

export async function reviewExplanation(provider: ModelProvider, source: string, explanation: string, lang: Lang, signal?: AbortSignal): Promise<ExplanationReview> {
  const raw = await provider.generate(reviewMessages(source, explanation, lang), { jsonSchema: REVIEW_SCHEMA, maxTokens: 400, temperature: 0.2, signal });
  return parseReview(raw);
}

/** Model bazen JSON'u metin ya da kod bloğu içinde döndürür; ilk geçerli nesneyi ayıklar. */
export function extractJson(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        /* aşağıda hata */
      }
    }
    throw new AppError('ZHN-006', 'json');
  }
}
