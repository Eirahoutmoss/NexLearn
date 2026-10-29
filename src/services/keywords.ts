import { normalizeForSearch } from '../domain/text';
import type { SourceSegment } from '../domain/types';

/**
 * Modelsiz anahtar kavram çıkarımı (TF-IDF + başlık/kısaltma ağırlığı).
 * Sonuçlar yalnızca ÖNERİDİR; kullanıcı onaylamadan kavram oluşturulmaz.
 */

const STOP_TR = `acaba ama ancak artık aslında az bazı belki ben beni benim bile bir biri birkaç birşey biz bize bizi bizim bu buna bunda bundan bunu bunun burada böyle böylece çok çünkü da daha dahi de defa değil diğer diye dolayı dolayısıyla en gibi göre hem hep hepsi her hiç için ile ise işte kadar karşın kendi kendine ki kim kimse mi mı mu mü nasıl ne neden nerede nereye niçin niye o olan olarak oldu olduğu olduğunu olmak olması olur olursa ona ondan onlar onları onların onu onun orada öyle pek rağmen sadece sanki şey şu şuna şunda şundan şunu tarafından üzere var vardır ve veya ya yani yine yoksa zaten ayrıca bunlar şöyle sonra önce yapılır yapar eder etmek edilir olabilir arasında üzerinde içinde kullanır kullanılır sağlar başka tek iki üç`;
const STOP_EN = `a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours each`;
const STOP = new Set([...STOP_TR.split(/\s+/), ...STOP_EN.split(/\s+/)].map((w) => normalizeForSearch(w)));

export interface KeywordSuggestion {
  term: string;
  score: number;
  count: number;
  segmentId: string;
}

interface Token {
  surface: string;
  norm: string;
  acronym: boolean;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/[\p{L}][\p{L}\p{N}'’-]*/gu)) {
    const surface = m[0].replace(/['’].*$/, '');
    const acronym = /^[\p{Lu}\p{N}]{2,7}$/u.test(surface);
    out.push({ surface, norm: normalizeForSearch(surface), acronym });
  }
  return out;
}

/** Türkçe ekleri kabaca birleştiren kök anahtarı. */
function stemKey(norm: string): string {
  return norm.length > 6 ? norm.slice(0, Math.max(5, norm.length - 4)) : norm;
}

const isContent = (t: Token) => t.acronym || (t.norm.length >= 4 && !STOP.has(t.norm) && !/^\d+$/.test(t.norm));
/** İkili terim parçası: kısa ama anlamlı kelimelere ("el sıkışma") izin verir. */
const isPart = (t: Token) => !t.acronym && t.norm.length >= 2 && !STOP.has(t.norm) && !/^\d+$/.test(t.norm);

export function extractKeywords(segments: Pick<SourceSegment, 'id' | 'text' | 'segmentType'>[], limit = 15): KeywordSuggestion[] {
  const docs = segments.filter((s) => s.text.trim());
  if (!docs.length) return [];
  const df = new Map<string, number>();
  const tf = new Map<string, number>();
  const firstSeg = new Map<string, string>();
  const forms = new Map<string, Map<string, number>>();
  const addForm = (key: string, surface: string) => {
    const m = forms.get(key) ?? new Map<string, number>();
    m.set(surface, (m.get(surface) ?? 0) + 1);
    forms.set(key, m);
  };
  for (const seg of docs) {
    const tokens = tokenize(seg.text);
    const seen = new Set<string>();
    const weight = seg.segmentType === 'heading' ? 3 : 1;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const keys: [string, string, number][] = [];
      if (isContent(t)) keys.push([t.acronym ? `A:${t.surface}` : stemKey(t.norm), t.surface, t.acronym ? 1.6 : 1]);
      const n = tokens[i + 1];
      if (n && isPart(t) && isPart(n) && (isContent(t) || isContent(n))) keys.push([`${stemKey(t.norm)} ${stemKey(n.norm)}`, `${t.surface} ${n.surface}`, 1.3]);
      for (const [key, surface, boost] of keys) {
        tf.set(key, (tf.get(key) ?? 0) + weight * boost);
        addForm(key, surface);
        if (!firstSeg.has(key)) firstSeg.set(key, seg.id);
        if (!seen.has(key)) {
          seen.add(key);
          df.set(key, (df.get(key) ?? 0) + 1);
        }
      }
    }
  }
  const N = docs.length;
  const scored: KeywordSuggestion[] = [];
  for (const [key, f] of tf) {
    const isBigram = key.includes(' ');
    const count = [...(forms.get(key)?.values() ?? [])].reduce((a, b) => a + b, 0);
    if (isBigram && count < 2) continue;
    if (!key.startsWith('A:') && !isBigram && count < 2 && N > 3) continue;
    const idf = Math.log(1 + N / (df.get(key) ?? 1));
    // En sık yüzey biçimi; eşitlikte en kısası (kök hâline en yakın).
    const term = [...forms.get(key)!.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    scored.push({ term: /^\p{Ll}/u.test(term) ? term : term, score: Math.round(f * idf * 100) / 100, count, segmentId: firstSeg.get(key)! });
  }
  scored.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term, 'tr'));
  // Bir ikili terimin parçası olan tekli terimi, ikili daha güçlüyse çıkar.
  const result: KeywordSuggestion[] = [];
  for (const s of scored) {
    const n = normalizeForSearch(s.term);
    if (result.some((r) => r.term.includes(' ') && normalizeForSearch(r.term).split(' ').includes(n))) continue;
    result.push(s);
    if (result.length >= limit) break;
  }
  return result;
}
