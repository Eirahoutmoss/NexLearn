import { AppError } from '../../domain/errors';
import { extensionOf } from '../../domain/text';
import type { SourceType } from '../../domain/types';
import { segmentMarkdown, segmentPlainText, type SegmentDraft } from './segment';

/** Boyut sınırları (bellek/disk tükenmesine karşı). */
export const MAX_PDF_BYTES = 200 * 1024 * 1024;
export const MAX_TEXT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

export type DetectedKind = { sourceType: SourceType; mimeType: string };

/** Dosya türünü önce sihirli baytlardan, sonra uzantıdan belirler. Uzantıya körü körüne güvenilmez. */
export function detectKind(name: string, bytes: Uint8Array): DetectedKind {
  const b = bytes;
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x1f, 0x8b) || starts(0x37, 0x7a, 0xbc, 0xaf) || starts(0x52, 0x61, 0x72, 0x21)) {
    throw new AppError('SRC-005');
  }
  if (starts(0x25, 0x50, 0x44, 0x46)) return { sourceType: 'pdf', mimeType: 'application/pdf' };
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { sourceType: 'image', mimeType: 'image/png' };
  if (starts(0xff, 0xd8, 0xff)) return { sourceType: 'image', mimeType: 'image/jpeg' };
  if (starts(0x47, 0x49, 0x46, 0x38)) return { sourceType: 'image', mimeType: 'image/gif' };
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { sourceType: 'image', mimeType: 'image/webp' };
  }
  const ext = extensionOf(name);
  if (ext === 'md' || ext === 'markdown' || ext === 'mdown') return { sourceType: 'markdown', mimeType: 'text/markdown' };
  if (ext === 'txt' || ext === 'text' || ext === '') {
    if (looksBinary(b)) throw new AppError('SRC-001', 'binary');
    return { sourceType: 'txt', mimeType: 'text/plain' };
  }
  if (ext === 'pdf') throw new AppError('SRC-002', 'bad-header');
  throw new AppError('SRC-001', ext.slice(0, 8));
}

function looksBinary(b: Uint8Array): boolean {
  const n = Math.min(b.length, 4096);
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c === 0) return true;
    if (c < 8 || (c > 13 && c < 32)) ctrl++;
  }
  return n > 0 && ctrl / n > 0.1;
}

export function checkSize(kind: SourceType, size: number): void {
  const limit = kind === 'pdf' ? MAX_PDF_BYTES : kind === 'image' ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
  if (size > limit) throw new AppError('SRC-004', String(limit));
  if (size === 0) throw new AppError('SRC-007', 'empty-file');
}

/** UTF-8 (BOM'lu/BOM'suz) dener; geçersizse Türkçe Windows-1254 kod sayfasına düşer. */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes), encoding: 'utf-8' };
  } catch {
    try {
      return { text: new TextDecoder('windows-1254').decode(bytes), encoding: 'windows-1254' };
    } catch {
      return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8-lossy' };
    }
  }
}

export function extractTextDrafts(kind: 'txt' | 'markdown' | 'note' | 'paste', text: string): SegmentDraft[] {
  return kind === 'markdown' || kind === 'note' ? segmentMarkdown(text) : segmentPlainText(text);
}
