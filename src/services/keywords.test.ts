import { describe, expect, it } from 'vitest';
import { extractKeywords } from './keywords';
import { segmentMarkdown } from './import/segment';

const md = `# Ağ Protokolleri

TCP güvenilir iletim sağlar. TCP bağlantısı üç yönlü el sıkışma ile başlar.

## UDP

UDP bağlantısızdır. UDP paketleri sırasız gelebilir ve paketler kaybolabilir.

## Yönlendirme

Yönlendiriciler paketleri IP adreslerine bakarak iletir. IP adresleri ağları ayırır.

El sıkışma süreci TCP için kritiktir.`;

describe('modelsiz anahtar kavram çıkarımı', () => {
  const segs = segmentMarkdown(md).map((d, i) => ({ id: `s${i}`, text: d.text, segmentType: d.segmentType }));
  const kw = extractKeywords(segs, 10);
  const terms = kw.map((k) => k.term);
  it('kısaltmaları ve tekrar eden terimleri bulur, durak kelimeleri almaz', () => {
    expect(terms).toEqual(expect.arrayContaining(['TCP', 'UDP', 'IP']));
    expect(terms.some((t) => /paket/i.test(t))).toBe(true);
    expect(terms).not.toContain('ile');
    expect(terms).not.toContain('için');
  });
  it('tekrar eden ikili terimleri yakalar ve kaynak segmentini verir', () => {
    expect(terms.some((t) => /el sıkışma/i.test(t))).toBe(true);
    const tcp = kw.find((k) => k.term === 'TCP')!;
    expect(segs.find((s) => s.id === tcp.segmentId)!.text).toContain('TCP');
  });
  it('boş girdi', () => expect(extractKeywords([])).toEqual([]));
});
