import { describe, expect, it } from 'vitest';
import { joinPdfLines, paragraphsFromPdfLines, segmentMarkdown, segmentPlainText, stripInlineMarkdown } from './segment';
import { detectKind, decodeText, checkSize } from './importers';

describe('düz metin bölütleme', () => {
  it('boş satırlarla paragraflara ayırır ve ofsetleri korur', () => {
    const t = 'Birinci paragraf\nsatır iki.\n\nİkinci paragraf.\r\n\r\n\r\nÜçüncü.';
    const d = segmentPlainText(t);
    expect(d.map((x) => x.text)).toEqual(['Birinci paragraf satır iki.', 'İkinci paragraf.', 'Üçüncü.']);
    const norm = t.replace(/\r\n?/g, '\n');
    expect(norm.slice(d[1].startOffset, d[1].endOffset)).toBe('İkinci paragraf.');
  });
});

describe('Markdown bölütleme', () => {
  const md = `# Ağ Temelleri\n\nGiriş **paragrafı** ve [bağlantı](https://ornek.com).\n\n## TCP\n\n- Güvenilir\n- Bağlantı yönelimli\n\n> Alıntı satırı\n\n\`\`\`\nkod <script>alert(1)</script>\n\`\`\`\n\n### El sıkışma\n\nÜç adım.\n\n## UDP\n\nBağlantısız.`;
  const d = segmentMarkdown(md);
  it('türleri ve başlık yolunu çıkarır', () => {
    expect(d.map((x) => x.segmentType)).toEqual(['heading', 'paragraph', 'heading', 'list', 'quote', 'code', 'heading', 'paragraph', 'heading', 'paragraph']);
    expect(d[1].text).toBe('Giriş paragrafı ve bağlantı.');
    expect(d[7].headingPath).toEqual(['Ağ Temelleri', 'TCP', 'El sıkışma']);
    expect(d[9].headingPath).toEqual(['Ağ Temelleri', 'UDP']);
    expect(d[2].level).toBe(2);
  });
  it('HTML yorumlanmaz, düz metin kalır', () => {
    expect(d[5].text).toContain('<script>');
  });
  it('satır içi işaretleri temizler', () => {
    expect(stripInlineMarkdown('*eğik* ve `kod` ve ~~çizik~~ ve ![resim](a.png)')).toBe('eğik ve kod ve çizik ve resim');
  });
});

describe('PDF satır → paragraf', () => {
  it('dikey boşluğa göre paragraf, sayfa numarası korunur', () => {
    const lines = [
      { text: 'Birinci satır', y: 100, height: 10 },
      { text: 'devam eden satır', y: 112, height: 10 },
      { text: 'Yeni paragraf', y: 140, height: 10 },
    ];
    const d = paragraphsFromPdfLines(lines, 3, 0);
    expect(d).toHaveLength(2);
    expect(d[0].text).toBe('Birinci satır devam eden satır');
    expect(d[1].pageNumber).toBe(3);
    expect(d[1].startOffset).toBeGreaterThan(d[0].startOffset);
  });
  it('satır sonu tirelemesini birleştirir', () => {
    expect(joinPdfLines(['bilgi-', 'sayar ağı'])).toBe('bilgisayar ağı');
    expect(joinPdfLines(['TCP/IP-', 'Model'])).toBe('TCP/IP- Model');
  });
});

describe('dosya türü tespiti', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it('sihirli baytlara göre PDF/ZIP/görsel', () => {
    expect(detectKind('x.txt', enc('%PDF-1.7')).sourceType).toBe('pdf');
    expect(() => detectKind('kitap.pdf', new Uint8Array([0x50, 0x4b, 3, 4]))).toThrow(/SRC-005/);
    expect(detectKind('a.bin', new Uint8Array([0x89, 0x50, 0x4e, 0x47])).sourceType).toBe('image');
  });
  it('uzantı ve ikili içerik denetimi', () => {
    expect(detectKind('n.md', enc('# a')).sourceType).toBe('markdown');
    expect(() => detectKind('n.docx', enc('abc'))).toThrow(/SRC-001/);
    expect(() => detectKind('n.txt', new Uint8Array([1, 0, 2, 3]))).toThrow(/SRC-001/);
    expect(() => detectKind('sahte.pdf', enc('merhaba'))).toThrow(/SRC-002/);
  });
  it('boyut sınırları ve boş dosya', () => {
    expect(() => checkSize('txt', 0)).toThrow(/SRC-007/);
    expect(() => checkSize('txt', 21 * 1024 * 1024)).toThrow(/SRC-004/);
  });
  it('Windows-1254 Türkçe metin çözülür', () => {
    const bytes = new Uint8Array([0xfe, 0xfd, 0xf0]); // ş ı ğ (cp1254)
    expect(decodeText(bytes)).toEqual({ text: 'şığ', encoding: 'windows-1254' });
    expect(decodeText(enc('ışık')).encoding).toBe('utf-8');
  });
});
