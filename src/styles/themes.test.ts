import { describe, expect, it } from 'vitest';
import { ACCENTS, THEMES, contrast, tokensFor, type ConcreteTheme } from './themes';

const themes = Object.keys(THEMES) as ConcreteTheme[];

describe('tema kontrastı (WCAG 2.2 AA)', () => {
  for (const id of themes) {
    for (const accent of ['theme', 'orange', 'sea', 'green', 'purple'] as const) {
      const t = tokensFor(id, accent);
      it(`${id}/${accent}`, () => {
        const fails: string[] = [];
        const need = (name: string, fg: string, bg: string, min: number) => {
          const c = contrast(fg, bg);
          if (c < min) fails.push(`${name}: ${c.toFixed(2)} < ${min}`);
        };
        for (const [bgName, bg] of [['bg', t.bg], ['surface', t.surface], ['surface2', t.surface2], ['bgElev', t.bgElev]] as const) {
          need(`text/${bgName}`, t.text, bg, 4.5);
          need(`textMuted/${bgName}`, t.textMuted, bg, 4.5);
          need(`accentText/${bgName}`, t.accentText, bg, 4.5);
          need(`focus/${bgName}`, t.focus, bg, 3);
          need(`danger/${bgName}`, t.danger, bg, 4.5);
          need(`success/${bgName}`, t.success, bg, 4.5);
          need(`warning/${bgName}`, t.warning, bg, 4.5);
        }
        need('onAccent/accent', t.onAccent, t.accent, 4.5);
        need('accent/surface (UI)', t.accent, t.surface, 3);
        need('borderStrong/surface (UI)', t.borderStrong, t.surface, 3);
        need('accentText/accentSoft', t.accentText, t.accentSoft, 4.5);
        need('text/accentSoft', t.text, t.accentSoft, 4.5);
        need('danger/dangerSoft', t.danger, t.dangerSoft, 4.5);
        need('success/successSoft', t.success, t.successSoft, 4.5);
        need('warning/warningSoft', t.warning, t.warningSoft, 4.5);
        for (const hl of [t.hlImportant, t.hlQuestion, t.hlDefinition, t.hlExample, t.hlReview]) need(`hlText/${hl}`, t.hlText, hl, 4.5);
        for (const m of [t.modRead, t.modMemory, t.modLearn, t.modApply]) need(`mod/${m}`, m, t.surface, 3);
        expect(fails).toEqual([]);
      });
    }
  }
  it('accent setleri tanımlı', () => expect(Object.keys(ACCENTS)).toHaveLength(4));
});
