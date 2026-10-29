import { strToU8, zipSync } from 'fflate';

/** Test için sentetik EPUB üretir. */
export function makeEpub(chapters: { title: string; body: string }[], opts: { drm?: boolean; title?: string } = {}): Uint8Array {
  const manifest = chapters.map((_, i) => `<item id="c${i}" href="text/ch${i}.xhtml" media-type="application/xhtml+xml"/>`).join('');
  const spine = chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('');
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': [strToU8('<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'), { level: 6 }],
    'OEBPS/content.opf': [strToU8(`<package><metadata><dc:title>${opts.title ?? 'Ağ Kitabı'}</dc:title><dc:creator>Yazar &amp; Ortak</dc:creator></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`), { level: 6 }],
  };
  chapters.forEach((c, i) => {
    files[`OEBPS/text/ch${i}.xhtml`] = [strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{}</style></head><body><h1>${c.title}</h1>${c.body}</body></html>`), { level: 6 }];
  });
  if (opts.drm) files['META-INF/encryption.xml'] = [strToU8('<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>'), { level: 6 }];
  return zipSync(files);
}

