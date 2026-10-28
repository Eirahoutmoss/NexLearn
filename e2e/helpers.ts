import { expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** İlk kullanım tanıtımını atlar (her test temiz bir tarayıcı bağlamıyla başlar). */
export async function openApp(page: Page, hash = '/') {
  await page.goto(`/#${hash}`);
  const dialog = page.getByRole('dialog', { name: 'NexLearn’e hoş geldin' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Tanıtımı atla' }).click();
  await expect(dialog).toBeHidden();
}

export const SAMPLE_MD = `# Ağ Protokolleri

TCP güvenilir ve sıralı iletim sağlar. Işık hızında değil ama düzenli çalışır.

## UDP

UDP bağlantısızdır ve düşük gecikme için tercih edilir.

## Şifreleme

Çiğdem öğrenciler için güvenli iletişimi anlatıyor.`;

/** Dosya seçici üzerinden dosya içe aktarır. */
export async function importFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.getByRole('button', { name: 'Kaynak ekle' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Kaynak ekle' });
  await dialog.getByTestId('file-input').setInputFiles(files);
  return dialog;
}

export async function importMarkdown(page: Page, name = 'protokoller.md', text = SAMPLE_MD) {
  const dialog = await importFiles(page, [{ name, mimeType: 'text/markdown', buffer: Buffer.from(text, 'utf8') }]);
  await expect(dialog.getByText('Hazır')).toBeVisible();
  await dialog.getByRole('button', { name: 'Okumaya başla' }).click();
  await expect(page.locator('.reading')).toBeVisible();
}

/** Okuma alanında verilen metni programatik olarak seçer ve seçim araç çubuğunu tetikler. */
export async function selectText(page: Page, text: string) {
  await page.evaluate((needle) => {
    const spans = Array.from(document.querySelectorAll<HTMLElement>('[data-seg-text]'));
    for (const span of spans) {
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const idx = node.textContent!.indexOf(needle);
        if (idx >= 0) {
          const r = document.createRange();
          r.setStart(node, idx);
          r.setEnd(node, idx + needle.length);
          const sel = window.getSelection()!;
          sel.removeAllRanges();
          sel.addRange(r);
          document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          return;
        }
      }
    }
    throw new Error(`metin bulunamadı: ${needle}`);
  }, text);
}

export async function makeTextPdf(pages: string[][]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    let y = 780;
    for (const line of lines) {
      if (line === '') {
        y -= 24;
        continue;
      }
      page.drawText(line, { x: 60, y, size: 12, font });
      y -= 16;
    }
  }
  return Buffer.from(await doc.save());
}

export async function makeScannedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 60, y: 600, width: 300, height: 120 });
  return Buffer.from(await doc.save());
}

export function hasQpdf(): boolean {
  try {
    execFileSync('qpdf', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function encryptPdf(input: Buffer, password: string): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'nl-'));
  const src = join(dir, 'in.pdf');
  const out = join(dir, 'out.pdf');
  writeFileSync(src, input);
  execFileSync('qpdf', ['--encrypt', password, `${password}-owner`, '256', '--', src, out]);
  return readFileSync(out);
}
