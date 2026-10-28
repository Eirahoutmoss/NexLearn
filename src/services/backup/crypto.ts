import { AppError } from '../../domain/errors';

/**
 * İsteğe bağlı yedek şifreleme: PBKDF2-SHA256 ile anahtar türetme + AES-256-GCM.
 * Biçim: "NXLENC01" (8 bayt) | yineleme sayısı (4 bayt, big-endian) | tuz (16) | IV (12) | şifreli metin.
 * Parola unutulursa kurtarma yoktur. Parola hiçbir yerde saklanmaz veya loglanmaz.
 */
const MAGIC = new TextEncoder().encode('NXLENC01');
export const PBKDF2_ITERATIONS = 600_000;

export function isEncryptedBackup(bytes: Uint8Array): boolean {
  return bytes.length > MAGIC.length && MAGIC.every((b, i) => bytes[i] === b);
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBytes(plain: Uint8Array, password: string, iterations = PBKDF2_ITERATIONS): Promise<Uint8Array> {
  if (!password) throw new AppError('VAL-001', 'password');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource));
  const out = new Uint8Array(MAGIC.length + 4 + 16 + 12 + cipher.length);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(MAGIC.length, iterations);
  out.set(salt, MAGIC.length + 4);
  out.set(iv, MAGIC.length + 20);
  out.set(cipher, MAGIC.length + 32);
  return out;
}

export async function decryptBytes(data: Uint8Array, password: string): Promise<Uint8Array> {
  if (!isEncryptedBackup(data)) throw new AppError('RST-002', 'not-encrypted');
  const iterations = new DataView(data.buffer, data.byteOffset).getUint32(MAGIC.length);
  if (iterations < 10_000 || iterations > 10_000_000) throw new AppError('RST-002', 'iterations');
  const salt = data.slice(MAGIC.length + 4, MAGIC.length + 20);
  const iv = data.slice(MAGIC.length + 20, MAGIC.length + 32);
  const cipher = data.slice(MAGIC.length + 32);
  const key = await deriveKey(password, salt, iterations);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, cipher as BufferSource));
  } catch {
    throw new AppError('RST-003');
  }
}
