/**
 * Hata taksonomisi (bkz. docs/DATA_MODEL.md). Kullanıcı mesajları i18n'de `errors.<KOD>` altında durur.
 * `details` alanına asla kaynak metni, dosya adı veya kişisel veri yazılmaz.
 */
export const ERROR_CODES = [
  'SRC-001', // desteklenmeyen biçim
  'SRC-002', // bozuk / şifreli PDF
  'SRC-003', // metin katmanı yok
  'SRC-004', // dosya çok büyük
  'SRC-005', // sıkıştırılmış arşiv (ZIP) desteklenmiyor
  'SRC-006', // içe aktarma iptal edildi
  'SRC-007', // içerik çıkarılamadı (boş/anlamsız)
  'SRC-008', // yanlış parola
  'DB-001', // göç başarısız
  'DB-002', // disk dolu
  'DB-003', // eşzamanlı değişiklik çakışması
  'DB-004', // kayıt bulunamadı
  'NET-001', // ağ isteği başarısız
  'EXP-001', // dışa aktarma doğrulanamadı
  'RST-001', // yedek daha yeni bir sürümden
  'RST-002', // yedek bozuk / sağlama toplamı uyuşmuyor
  'RST-003', // yedek parolası yanlış
  'REL-001', // kendine ilişki
  'REL-002', // döngü oluşturur
  'REL-003', // yinelenen ilişki
  'VAL-001', // zorunlu alan boş
  'UPD-001', // güncelleme doğrulanamadı
  'UNK-000', // beklenmeyen hata
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Yalnızca teknik, kişisel veri içermeyen bağlam. */
  readonly details?: string;

  constructor(code: ErrorCode, details?: string) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Bilinmeyen hataları güvenli bir AppError'a çevirir (mesaj gövdesi taşınmaz). */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (e instanceof DOMException && e.name === 'QuotaExceededError') return new AppError('DB-002');
  if (e instanceof DOMException && e.name === 'AbortError') return new AppError('SRC-006');
  const name = e instanceof Error ? e.name : typeof e;
  return new AppError('UNK-000', name);
}

/** Kişisel veri içermeyen hata günlüğü (bellek içi halka tampon). */
const LOG_LIMIT = 50;
const errorLog: { at: string; code: ErrorCode; context: string }[] = [];

export function logError(e: AppError, context: string): void {
  errorLog.push({ at: new Date().toISOString(), code: e.code, context });
  if (errorLog.length > LOG_LIMIT) errorLog.shift();
  if (import.meta.env?.DEV) console.warn(`[NexLearn] ${e.code} @ ${context}${e.details ? ` (${e.details})` : ''}`);
}

export function getErrorLog(): readonly { at: string; code: ErrorCode; context: string }[] {
  return errorLog;
}
