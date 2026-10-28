/**
 * NexLearn domain türleri.
 * Kurallar: tüm zamanlar UTC ISO 8601 metin olarak saklanır; silme yumuşaktır (deletedAt);
 * her kayıt çakışma tespiti için monoton `revision` taşır.
 */

export type ISODate = string;

export interface BaseEntity {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  deletedAt?: ISODate | null;
  revision: number;
  /** Deneme modu (örnek içerik) kayıtlarını işaretler; toplu kaldırma için. */
  isSample?: boolean;
}

export type SourceType = 'pdf' | 'txt' | 'markdown' | 'note' | 'paste' | 'image';

export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'partial' | 'failed' | 'empty';

export interface Source extends BaseEntity {
  title: string;
  sourceType: SourceType;
  originalFilename?: string;
  mimeType?: string;
  sizeBytes?: number;
  contentHash: string;
  processingStatus: ProcessingStatus;
  errorCode?: string;
  pageCount?: number;
  wordCount: number;
  segmentCount: number;
  tags: string[];
  /** Orijinal dosyanın `files` deposundaki anahtarı. */
  storageRef?: string;
  metadata: Record<string, string | number | boolean | null>;
}

export type LocatorType = 'page' | 'offset' | 'cfi' | 'xpath';

export interface Locator {
  type: LocatorType;
  value: number | string;
}

export type SegmentType = 'paragraph' | 'heading' | 'list' | 'code' | 'quote';

export type ExtractionMethod = 'text' | 'markdown' | 'pdf-text' | 'ocr' | 'user';

export interface SourceSegment {
  id: string;
  sourceId: string;
  index: number;
  segmentType: SegmentType;
  /** Başlık düzeyi (1-6), yalnızca heading için. */
  level?: number;
  text: string;
  pageNumber?: number;
  startOffset: number;
  endOffset: number;
  headingPath: string[];
  extractionMethod: ExtractionMethod;
  confidence?: number;
  locator: Locator;
  isSample?: boolean;
}

export interface SourceRef {
  sourceId: string;
  segmentId?: string;
  pageNumber?: number;
}

export type AnnotationType = 'highlight' | 'note' | 'bookmark' | 'quote' | 'explanation';

export type HighlightColor = 'important' | 'question' | 'definition' | 'example' | 'review';

export interface Annotation extends BaseEntity {
  sourceId: string;
  segmentId: string;
  annotationType: AnnotationType;
  color?: HighlightColor;
  selectedText?: string;
  /** Segment metni içindeki karakter aralığı. */
  startInSegment?: number;
  endInSegment?: number;
  /** Birden çok segmenti kapsayan seçimler aynı grubu paylaşır. */
  groupId?: string;
  noteText?: string;
  tags: string[];
}

export type Provenance = 'user' | 'automatic' | 'imported';

export interface Concept extends BaseEntity {
  label: string;
  description: string;
  /** Kullanıcının kendi cümleleriyle açıklaması. */
  explanation: string;
  examples: string[];
  userConfirmed: boolean;
  provenance: Provenance;
  sourceRefs: SourceRef[];
  position?: { x: number; y: number } | null;
}

export const RELATION_TYPES = [
  'prerequisite_of',
  'part_of',
  'example_of',
  'contrasts_with',
  'supports',
  'related_to',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export interface ConceptRelation extends BaseEntity {
  fromConceptId: string;
  toConceptId: string;
  relationType: RelationType;
  provenance: Provenance;
  sourceRefs: SourceRef[];
  userConfirmed: boolean;
  confidence?: number | null;
}

export type LearningItemType = 'qa' | 'question';

export interface LearningItem extends BaseEntity {
  itemType: LearningItemType;
  prompt: string;
  answer: string;
  explanation: string;
  sourceRefs: SourceRef[];
  conceptIds: string[];
  tags: string[];
  suspended: boolean;
  provenance: Provenance;
}

export interface ReviewState {
  learningItemId: string;
  repetitionCount: number;
  intervalDays: number;
  easeFactor: number;
  lapseCount: number;
  dueAt: ISODate;
  lastReviewedAt: ISODate | null;
  algorithmVersion: string;
  revision: number;
  isSample?: boolean;
}

/** Kullanıcıya gösterilen 4 düğmenin SM-2 puanına eşlemesi (bkz. docs/DECISIONS.md ADR-005). */
export type ReviewButton = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewEvent {
  id: string;
  learningItemId: string;
  reviewedAt: ISODate;
  /** SM-2 puanı 0-5. */
  rating: number;
  button: ReviewButton;
  responseDurationMs?: number;
  answerText?: string;
  scheduleBefore: ScheduleSnapshot;
  scheduleAfter: ScheduleSnapshot;
  isSample?: boolean;
}

export interface ScheduleSnapshot {
  repetitionCount: number;
  intervalDays: number;
  easeFactor: number;
  lapseCount: number;
  dueAt: ISODate;
  lastReviewedAt: ISODate | null;
}

export interface TaskAttempt {
  id: string;
  at: ISODate;
  response: string;
  selfAssessment: 'done' | 'partial' | 'stuck';
}

/** NexÖğren uygulama görevi: öğrenileni yeni bir bağlamda kullanma. */
export interface ApplicationTask extends BaseEntity {
  prompt: string;
  conceptIds: string[];
  sourceRefs: SourceRef[];
  attempts: TaskAttempt[];
}

export type SessionType = 'reading' | 'review' | 'learn';

export interface LearningSession {
  id: string;
  sessionType: SessionType;
  startedAt: ISODate;
  endedAt: ISODate;
  durationMs: number;
  sourceIds: string[];
  activitySummary: Record<string, number>;
  isSample?: boolean;
}

export interface ReadingState {
  sourceId: string;
  /** En son görüntülenen segment indeksi. */
  segmentIndex: number;
  /** Okunan en ileri segment indeksi (ilerleme için). */
  maxSegmentIndex: number;
  updatedAt: ISODate;
  isSample?: boolean;
}

export type ThemeId = 'system' | 'aydinlik' | 'sicak' | 'pastel' | 'gece' | 'ametist' | 'kontrast';
export type AccentId = 'theme' | 'orange' | 'sea' | 'green' | 'purple';
export type ReadingFont = 'literata' | 'inter' | 'atkinson' | 'opendyslexic';
export type MotionPref = 'system' | 'reduce' | 'full';
export type Language = 'tr' | 'en';

export interface DailyGoals {
  enabled: boolean;
  reviewCards: number;
  readingMinutes: number;
  notes: number;
  tasks: number;
}

export interface Settings {
  theme: ThemeId;
  accent: AccentId;
  readingFont: ReadingFont;
  fontSizePx: number;
  lineHeight: number;
  measureCh: number;
  letterSpacingEm: number;
  readingRuler: boolean;
  motion: MotionPref;
  showQuotes: boolean;
  dailyGoals: DailyGoals;
  storeTypedAnswers: boolean;
  language: Language;
  onboardingDone: boolean;
  shortcuts: Record<string, string>;
}

export interface FileRecord {
  id: string;
  sourceId: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  isSample?: boolean;
}
