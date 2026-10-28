/** Türkçe duyarlı metin yardımcıları. */

const FOLD_MAP: Record<string, string> = {
  ı: 'i', i: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u',
};

/**
 * Arama için normalleştirme: Türkçe küçük harfe çevirir (İ→i, I→ı), sonra aksanları katlar
 * (ı→i, ş→s ...). Böylece "Işık", "ışık", "isik" aynı anahtara iner.
 */
export function normalizeForSearch(input: string): string {
  const lower = input.toLocaleLowerCase('tr-TR');
  let out = '';
  for (const ch of lower.normalize('NFC')) {
    out += FOLD_MAP[ch] ?? ch;
  }
  return out
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

/** Ortalama 200 kelime/dk varsayımıyla dakika (en az 1). Yalnızca tahmindir. */
export function estimateReadingMinutes(words: number, wpm = 200): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round(words / wpm));
}

/** Metin boş mu ya da yalnızca boşluk/sembol mü? (kaynak kalite kontrolü) */
export function isMeaningless(text: string): boolean {
  const letters = text.match(/[\p{L}\p{N}]/gu);
  return !letters || letters.length < 3;
}

/** Dosya adından güvenli başlık: yol bileşenlerini ve kontrol karakterlerini atar. */
export function titleFromFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const noExt = base.replace(/\.[^.]{1,8}$/, '');
  // eslint-disable-next-line no-control-regex
  const cleaned = noExt.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[_]+/g, ' ').trim();
  return (cleaned || 'Adsız kaynak').slice(0, 200);
}

/** Uzantıyı küçük harfle döndürür (noktasız). */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const m = base.match(/\.([^.]{1,8})$/);
  return m ? m[1].toLowerCase() : '';
}

/** Arama sonucu için eşleşme etrafından kısa parça üretir. */
export function snippetAround(text: string, start: number, length: number, radius = 60): string {
  const s = Math.max(0, start - radius);
  const e = Math.min(text.length, start + length + radius);
  return `${s > 0 ? '…' : ''}${text.slice(s, e).replace(/\s+/g, ' ')}${e < text.length ? '…' : ''}`;
}
