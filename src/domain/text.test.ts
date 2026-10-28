import { describe, expect, it } from 'vitest';
import { countWords, estimateReadingMinutes, extensionOf, isMeaningless, normalizeForSearch, titleFromFilename } from './text';
import { resolveLocator, describeLocation } from './locator';
import { AppError, toAppError } from './errors';

describe('Türkçe arama normalleştirme', () => {
  it('İ/ı, ş/s, ğ/g, ç/c, ö/o, ü/u eşleşir', () => {
    expect(normalizeForSearch('IŞIK İstanbul')).toBe('isik istanbul');
    expect(normalizeForSearch('ışık')).toBe(normalizeForSearch('Işık'));
    expect(normalizeForSearch('Çiğdem Öğütücü')).toBe('cigdem ogutucu');
  });
});

describe('metin yardımcıları', () => {
  it('kelime sayımı Türkçe harfleri ve kesme işaretini kapsar', () => {
    expect(countWords("Türkiye'nin başkenti Ankara'dır.")).toBe(3);
    expect(countWords('')).toBe(0);
  });
  it('okuma süresi tahmini', () => {
    expect(estimateReadingMinutes(0)).toBe(0);
    expect(estimateReadingMinutes(50)).toBe(1);
    expect(estimateReadingMinutes(1000)).toBe(5);
  });
  it('anlamsız içerik tespiti', () => {
    expect(isMeaningless('   \n\t ... ---')).toBe(true);
    expect(isMeaningless('Merhaba')).toBe(false);
  });
  it('dosya adından güvenli başlık (yol bileşenleri atılır)', () => {
    expect(titleFromFilename('../../etc/ağ_notları.txt')).toBe('ağ notları');
    expect(titleFromFilename('C:\\x\\y\\Kitap.pdf')).toBe('Kitap');
    expect(extensionOf('a.MarkDown')).toBe('markdown');
  });
});

describe('konum çözümleme', () => {
  const segs = [
    { id: 's1', sourceId: 'x', index: 0, segmentType: 'paragraph' as const, text: 'a', pageNumber: 1, startOffset: 0, endOffset: 10, headingPath: ['Giriş'], extractionMethod: 'pdf-text' as const, locator: { type: 'page' as const, value: 1 } },
    { id: 's2', sourceId: 'x', index: 1, segmentType: 'paragraph' as const, text: 'b', pageNumber: 3, startOffset: 11, endOffset: 20, headingPath: [], extractionMethod: 'pdf-text' as const, locator: { type: 'page' as const, value: 3 } },
  ];
  it('sayfa ve ofset konumunu çözer, çözülemezse undefined', () => {
    expect(resolveLocator(segs, { type: 'page', value: 3 })?.id).toBe('s2');
    expect(resolveLocator(segs, { type: 'offset', value: 12 })?.id).toBe('s2');
    expect(resolveLocator(segs, { type: 'page', value: 9 })).toBeUndefined();
    expect(resolveLocator(segs, { type: 'cfi', value: 'x' })).toBeUndefined();
  });
  it('konum etiketi', () => {
    expect(describeLocation(segs[0])).toEqual({ page: 1, heading: 'Giriş', paragraph: 1 });
  });
});

describe('hata eşlemesi', () => {
  it('bilinmeyen hata içerik taşımadan UNK-000 olur', () => {
    const e = toAppError(new Error('gizli kaynak metni'));
    expect(e.code).toBe('UNK-000');
    expect(e.details).toBe('Error');
    expect(JSON.stringify(e)).not.toContain('gizli');
  });
  it('kota hatası DB-002, iptal SRC-006', () => {
    expect(toAppError(new DOMException('x', 'QuotaExceededError')).code).toBe('DB-002');
    expect(toAppError(new DOMException('x', 'AbortError')).code).toBe('SRC-006');
    expect(toAppError(new AppError('REL-001')).code).toBe('REL-001');
  });
});
