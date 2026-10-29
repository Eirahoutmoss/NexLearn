import { describe, expect, it } from 'vitest';
import { ocrTextToDrafts } from './ocr';

describe('OCR metni → segment', () => {
  it('paragraflar, tireleme, sayfa ve güven', () => {
    const d = ocrTextToDrafts('Bilgisayar ağ-\nları katmanlıdır.\nİkinci satır.\n\n\n  |  \n\nYeni paragraf', 3, 10, 87.6);
    expect(d.map((x) => x.text)).toEqual(['Bilgisayar ağları katmanlıdır. İkinci satır.', 'Yeni paragraf']);
    expect(d[0]).toMatchObject({ pageNumber: 3, startOffset: 10, extractionMethod: 'ocr', confidence: 88 });
  });
});
