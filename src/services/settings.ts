import { emitChange, getDb } from '../adapters/storage/db';
import type { Settings } from '../domain/types';

export const DEFAULT_SHORTCUTS: Readonly<Record<string, string>> = Object.freeze({
  search: 'Ctrl+K',
  showAnswer: 'Space',
  rateAgain: '1',
  rateHard: '2',
  rateGood: '3',
  rateEasy: '4',
  nextParagraph: 'J',
  prevParagraph: 'K',
  highlight: 'H',
  addNote: 'N',
  createCard: 'C',
  focusMode: 'F',
  goHome: 'G H',
  goLibrary: 'G L',
  goReview: 'G R',
  goMap: 'G M',
});

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  theme: 'system',
  accent: 'theme',
  readingFont: 'literata',
  fontSizePx: 19,
  lineHeight: 1.65,
  measureCh: 68,
  letterSpacingEm: 0,
  readingRuler: false,
  motion: 'system',
  showQuotes: true,
  dailyGoals: { enabled: false, reviewCards: 10, readingMinutes: 15, notes: 1, tasks: 1 },
  storeTypedAnswers: false,
  language: 'tr',
  onboardingDone: false,
  shortcuts: { ...DEFAULT_SHORTCUTS },
});

const KEY = 'app';

/** Ayarları sınırlar içinde tutar (bozuk yedek/elle düzenleme karşısında savunma). */
export function sanitizeSettings(input: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(input ?? {}) } as Settings;
  const clamp = (v: unknown, min: number, max: number, def: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  s.fontSizePx = clamp(s.fontSizePx, 14, 32, DEFAULT_SETTINGS.fontSizePx);
  s.lineHeight = clamp(s.lineHeight, 1.3, 2.2, DEFAULT_SETTINGS.lineHeight);
  s.measureCh = clamp(s.measureCh, 40, 100, DEFAULT_SETTINGS.measureCh);
  s.letterSpacingEm = clamp(s.letterSpacingEm, 0, 0.12, 0);
  s.dailyGoals = { ...DEFAULT_SETTINGS.dailyGoals, ...(input?.dailyGoals ?? {}) };
  s.shortcuts = { ...DEFAULT_SHORTCUTS, ...(input?.shortcuts ?? {}) };
  const themes = ['system', 'aydinlik', 'sicak', 'pastel', 'gece', 'ametist', 'kontrast'];
  if (!themes.includes(s.theme)) s.theme = 'system';
  if (!['theme', 'orange', 'sea', 'green', 'purple'].includes(s.accent)) s.accent = 'theme';
  if (!['literata', 'inter', 'atkinson', 'opendyslexic'].includes(s.readingFont)) s.readingFont = 'literata';
  if (!['system', 'reduce', 'full'].includes(s.motion)) s.motion = 'system';
  if (!['tr', 'en'].includes(s.language)) s.language = 'tr';
  return s;
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const rec = await db.get('settings', KEY);
  if (!rec) return sanitizeSettings(undefined);
  const { id: _id, ...rest } = rec;
  return sanitizeSettings(rest);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = sanitizeSettings({ ...current, ...patch });
  const db = await getDb();
  await db.put('settings', { ...next, id: KEY });
  emitChange(['settings']);
  return next;
}
