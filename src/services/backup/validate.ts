import { AppError } from '../../domain/errors';

/** Yedekteki kayıtlar için hafif yapısal doğrulama (bağımlılıksız şema denetimi). */
type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';
type Spec = Record<string, FieldType | `${FieldType}?`>;

const base: Spec = { id: 'string', createdAt: 'string', updatedAt: 'string', revision: 'number' };

export const RECORD_SPECS = {
  sources: { ...base, title: 'string', sourceType: 'string', contentHash: 'string', processingStatus: 'string', wordCount: 'number', segmentCount: 'number', tags: 'array', metadata: 'object' },
  segments: { id: 'string', sourceId: 'string', index: 'number', segmentType: 'string', text: 'string', startOffset: 'number', endOffset: 'number', headingPath: 'array', extractionMethod: 'string', locator: 'object' },
  annotations: { ...base, sourceId: 'string', segmentId: 'string', annotationType: 'string', tags: 'array' },
  concepts: { ...base, label: 'string', description: 'string', explanation: 'string', examples: 'array', userConfirmed: 'boolean', provenance: 'string', sourceRefs: 'array' },
  relations: { ...base, fromConceptId: 'string', toConceptId: 'string', relationType: 'string', provenance: 'string', sourceRefs: 'array', userConfirmed: 'boolean' },
  items: { ...base, itemType: 'string', prompt: 'string', answer: 'string', explanation: 'string', sourceRefs: 'array', conceptIds: 'array', tags: 'array', suspended: 'boolean', provenance: 'string' },
  reviewStates: { learningItemId: 'string', repetitionCount: 'number', intervalDays: 'number', easeFactor: 'number', lapseCount: 'number', dueAt: 'string', algorithmVersion: 'string', revision: 'number' },
  reviewEvents: { id: 'string', learningItemId: 'string', reviewedAt: 'string', rating: 'number', scheduleBefore: 'object', scheduleAfter: 'object' },
  tasks: { ...base, prompt: 'string', conceptIds: 'array', sourceRefs: 'array', attempts: 'array' },
  sessions: { id: 'string', sessionType: 'string', startedAt: 'string', endedAt: 'string', durationMs: 'number', sourceIds: 'array', activitySummary: 'object' },
  readingStates: { sourceId: 'string', segmentIndex: 'number', maxSegmentIndex: 'number', updatedAt: 'string' },
} as const satisfies Record<string, Spec>;

export type RecordKind = keyof typeof RECORD_SPECS;

function typeOf(v: unknown): FieldType | 'null' | 'undefined' | 'other' {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object' || t === 'undefined') return t;
  return 'other';
}

/** Kayıt dizisini doğrular; ilk hatada RST-002 fırlatır (hangi tür ve indeks olduğu ayrıntıda, içerik olmadan). */
export function validateRecords(kind: RecordKind, value: unknown): void {
  if (!Array.isArray(value)) throw new AppError('RST-002', `${kind}:not-array`);
  const spec = RECORD_SPECS[kind] as Spec;
  value.forEach((rec, i) => {
    if (typeOf(rec) !== 'object') throw new AppError('RST-002', `${kind}[${i}]`);
    for (const [field, t] of Object.entries(spec)) {
      const optional = t.endsWith('?');
      const want = t.replace('?', '') as FieldType;
      const got = typeOf((rec as Record<string, unknown>)[field]);
      if (optional && (got === 'undefined' || got === 'null')) continue;
      if (got !== want || (want === 'number' && !Number.isFinite((rec as Record<string, number>)[field]))) {
        throw new AppError('RST-002', `${kind}[${i}].${field}`);
      }
    }
  });
}

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemVer(v: unknown): SemVer {
  if (typeof v !== 'string') throw new AppError('RST-002', 'schemaVersion');
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new AppError('RST-002', 'schemaVersion');
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/**
 * Sürüm uyumluluğu: aynı major okunur (daha yeni minor içindeki bilinmeyen alanlar korunur/yok sayılır);
 * daha yeni major reddedilir (RST-001); bir önceki major göç yoluyla okunur (şu an 1.x ilk sürüm).
 */
export function checkCompatibility(backup: SemVer, current: SemVer): 'same' | 'newer-minor' | 'migrate' {
  if (backup.major > current.major) throw new AppError('RST-001');
  if (backup.major < current.major - 1) throw new AppError('RST-001', 'too-old');
  if (backup.major < current.major) return 'migrate';
  if (backup.minor > current.minor) return 'newer-minor';
  return 'same';
}
