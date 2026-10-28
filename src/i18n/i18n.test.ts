import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translate } from './index';
import { tr, type Dict } from './tr';
import { en } from './en';
import { ERROR_CODES } from '../domain/errors';
import { RELATION_TYPES } from '../domain/types';
import { DEFAULT_SHORTCUTS } from '../services/settings';

function has(d: Dict, key: string): boolean {
  let cur: string | Dict | undefined = d;
  for (const p of key.split('.')) {
    if (cur == null || typeof cur === 'string') return false;
    cur = cur[p];
  }
  return typeof cur === 'string';
}
const hasAny = (d: Dict, k: string) => has(d, k) || has(d, `${k}_other`);

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f) && !f.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const SRC = join(__dirname, '..');
const staticKeys = new Set<string>();
for (const file of walk(SRC)) {
  for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) staticKeys.add(m[1]);
}

const dynamicKeys = [
  ...ERROR_CODES.flatMap((c) => [`errors.${c}.title`, `errors.${c}.action`]),
  ...RELATION_TYPES.map((r) => `relation.${r}`),
  ...['pending', 'processing', 'ready', 'partial', 'failed', 'empty'].map((s) => `status.${s}`),
  ...['pdf', 'txt', 'markdown', 'note', 'paste', 'image'].map((s) => `sourceType.${s}`),
  ...['important', 'question', 'definition', 'example', 'review'].map((s) => `colors.${s}`),
  ...['highlight', 'note', 'bookmark', 'quote', 'explanation'].map((s) => `annotationType.${s}`),
  ...['user', 'automatic', 'imported'].map((s) => `provenance.${s}`),
  ...['home', 'library', 'read', 'review', 'map', 'notes', 'tasks', 'progress', 'settings', 'help'].map((s) => `nav.${s}`),
  ...['again', 'hard', 'good', 'easy'].map((s) => `review.btn.${s}`),
  ...['firstSuccess', 'secondSuccess', 'streakSuccess', 'easyBonus', 'forgotten', 'hard'].map((s) => `review.reason.${s}`),
  ...['source', 'segment', 'card', 'concept', 'note'].map((s) => `palette.kind.${s}`),
  ...['queued', 'reading', 'extracting', 'saving', 'done', 'error', 'cancelled', 'duplicate'].map((s) => `import.phase.${s}`),
  ...['reviewCards', 'readingMinutes', 'notes', 'tasks'].map((s) => `home.goal.${s}`),
  ...['longAnswer', 'duplicatePrompt', 'noSource', 'answerInPrompt'].map((s) => `cardEditor.warning.${s}`),
  ...['system', 'aydinlik', 'sicak', 'pastel', 'gece', 'ametist', 'kontrast'].flatMap((s) => [`themes.${s}.name`, `themes.${s}.desc`]),
  ...['theme', 'orange', 'sea', 'green', 'purple'].map((s) => `accents.${s}`),
  ...['literata', 'inter', 'atkinson', 'opendyslexic'].map((s) => `fonts.${s}`),
  ...Object.keys(DEFAULT_SHORTCUTS).map((s) => `shortcuts.${s}`),
  ...['appearance', 'reading', 'home', 'privacy', 'data', 'keyboard', 'language', 'about'].map((s) => `settings.section.${s}`),
  ...['add', 'read', 'understand', 'connect', 'remember', 'apply', 'restudy'].flatMap((s) => [`help.loop.${s}`, `help.loopText.${s}`]),
  ...['prereq', 'partOf', 'example', 'contrast', 'apply', 'ownWords'].map((s) => `map.q.${s}`),
  ...['done', 'partial', 'stuck'].map((s) => `tasks.assess.${s}`),
  ...['greetMorning', 'greetDay', 'greetEvening', 'greetNight'].map((s) => `home.${s}`),
];

describe('çeviriler', () => {
  it('koddaki tüm sabit anahtarlar Türkçe ve İngilizce sözlükte var', () => {
    expect(staticKeys.size).toBeGreaterThan(300);
    const missingTr = [...staticKeys].filter((k) => !hasAny(tr, k));
    const missingEn = [...staticKeys].filter((k) => !hasAny(en, k));
    expect(missingTr).toEqual([]);
    expect(missingEn).toEqual([]);
  });
  it('dinamik anahtar aileleri eksiksiz', () => {
    expect(dynamicKeys.filter((k) => !hasAny(tr, k))).toEqual([]);
    expect(dynamicKeys.filter((k) => !hasAny(en, k))).toEqual([]);
  });
  it('parametre yerleştirme ve çoğul biçimler', () => {
    expect(translate('tr', 'home.dueCards', { count: 3 })).toBe('Bugün 3 kart');
    expect(translate('en', 'home.dueCards', { count: 1 })).toBe('1 card today');
    expect(translate('en', 'home.dueCards', { count: 2 })).toBe('2 cards today');
    expect(translate('tr', 'yok.boyle.anahtar')).toBe('yok.boyle.anahtar');
  });
});
