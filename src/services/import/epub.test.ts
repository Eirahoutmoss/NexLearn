import { strToU8, zipSync } from 'fflate';
import { makeEpub } from '../../tests/fixtures';
import { describe, expect, it } from 'vitest';
import { decodeEntities, looksLikeEpub, parseEpub, xhtmlToBlocks } from './epub';
import { detectKind } from './importers';

describe('EPUB', () => {
  const epub = makeEpub([
    { title: 'Giriş', body: '<p>Ağlar <b>katmanlıdır</b> &amp; düzenlidir.</p><script>alert(1)</script><ul><li>Bir</li><li>İki</li></ul>' },
    { title: 'TCP', body: '<h2>El sıkışma</h2><p>SYN, SYN-ACK, ACK.</p><blockquote>Alıntı</blockquote><pre>kod  satırı</pre>' },
  ]);
  it('EPUB sihirli baytlarını tanır, ZIP olarak reddetmez', () => {
    expect(looksLikeEpub(epub)).toBe(true);
    expect(detectKind('kitap.epub', epub).sourceType).toBe('epub');
    expect(() => detectKind('a.zip', zipSync({ 'a.txt': strToU8('x') }))).toThrow(/SRC-005/);
  });
  it('başlık, yazar, bölümler ve yapı korunur; betik atılır', () => {
    const r = parseEpub(epub);
    expect(r.title).toBe('Ağ Kitabı');
    expect(r.author).toBe('Yazar & Ortak');
    expect(r.chapters).toBe(2);
    expect(r.drafts.map((d) => d.segmentType)).toEqual(['heading', 'paragraph', 'list', 'heading', 'heading', 'paragraph', 'quote', 'code']);
    expect(r.drafts[1].text).toBe('Ağlar katmanlıdır & düzenlidir.');
    expect(r.drafts[2].text).toBe('• Bir\n• İki');
    expect(r.drafts.some((d) => d.text.includes('alert'))).toBe(false);
    expect(r.drafts[5].headingPath).toEqual(['TCP', 'El sıkışma']);
  });
  it('DRM reddedilir', () => {
    expect(() => parseEpub(makeEpub([{ title: 'a', body: '<p>b</p>' }], { drm: true }))).toThrow(/SRC-002/);
  });
  it('varlık çözümü ve blok çıkarımı', () => {
    expect(decodeEntities('&#305;&#x15F;&nbsp;&lt;')).toBe('ış <');
    expect(xhtmlToBlocks('<body><p>a<br/>b</p></body>')[0].text).toBe('a b');
  });
});
