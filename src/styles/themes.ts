import type { AccentId, ThemeId } from '../domain/types';

/**
 * Tasarım token'ları. Tüm temalar aynı semantik token'ları üretir; kontrast oranları
 * `themes.test.ts` içinde WCAG 2.2 AA eşiklerine göre otomatik doğrulanır.
 */
export interface ThemeTokens {
  scheme: 'light' | 'dark';
  bg: string;
  bgElev: string;
  surface: string;
  surface2: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  accent: string;
  onAccent: string;
  accentText: string;
  accentSoft: string;
  focus: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  hlImportant: string;
  hlQuestion: string;
  hlDefinition: string;
  hlExample: string;
  hlReview: string;
  hlText: string;
  overlay: string;
  shadow: string;
  landSky1: string;
  landSky2: string;
  landSun: string;
  land1: string;
  land2: string;
  land3: string;
  land4: string;
  /** Karakteristik ikincil renkler: modül kartlarının ikon tonları. */
  modRead: string;
  modMemory: string;
  modLearn: string;
  modApply: string;
}

export type ConcreteTheme = Exclude<ThemeId, 'system'>;

export const THEMES: Record<ConcreteTheme, ThemeTokens> = {
  aydinlik: {
    scheme: 'light',
    bg: '#FAF6EF',
    bgElev: '#FFFDF9',
    surface: '#FFFFFF',
    surface2: '#F4EEE4',
    border: '#E6DDCD',
    borderStrong: '#857862',
    text: '#1D2742',
    textMuted: '#525B6F',
    accent: '#B5501A',
    onAccent: '#FFFFFF',
    accentText: '#A3461A',
    accentSoft: '#FBE8DA',
    focus: '#1F5FBF',
    danger: '#B42318',
    dangerSoft: '#FDE7E4',
    success: '#1D7348',
    successSoft: '#E0F3E8',
    warning: '#845500',
    warningSoft: '#FCF0D5',
    hlImportant: '#FFE58A',
    hlQuestion: '#CFE3FF',
    hlDefinition: '#FFD6CC',
    hlExample: '#D2F0D8',
    hlReview: '#E6DAFF',
    hlText: '#1D2742',
    overlay: 'rgba(29, 39, 66, 0.45)',
    shadow: '0 1px 2px rgba(60, 45, 20, 0.06), 0 6px 20px rgba(60, 45, 20, 0.07)',
    landSky1: '#FCEBD3',
    landSky2: '#F7D5AE',
    landSun: '#F4AE4C',
    land1: '#CDBBD8',
    land2: '#A992BA',
    land3: '#6F907B',
    land4: '#3F5E52',
    modRead: '#1F7A6B',
    modMemory: '#B5384A',
    modLearn: '#2F5FB3',
    modApply: '#B5501A',
  },
  sicak: {
    scheme: 'light',
    bg: '#F3ECE1',
    bgElev: '#F8F2E9',
    surface: '#FBF7F1',
    surface2: '#ECE3D5',
    border: '#DACDB9',
    borderStrong: '#7E705A',
    text: '#2B2117',
    textMuted: '#5A4C3B',
    accent: '#8C4A1E',
    onAccent: '#FFFFFF',
    accentText: '#7E4219',
    accentSoft: '#F1DCC8',
    focus: '#2E6A39',
    danger: '#A3261B',
    dangerSoft: '#F8E1DC',
    success: '#2E6A39',
    successSoft: '#DFEEDD',
    warning: '#7A5506',
    warningSoft: '#F5E8C9',
    hlImportant: '#FBE08A',
    hlQuestion: '#D3E2F4',
    hlDefinition: '#F7D3C3',
    hlExample: '#D6EBCB',
    hlReview: '#E4D8F2',
    hlText: '#2B2117',
    overlay: 'rgba(43, 33, 23, 0.45)',
    shadow: '0 1px 2px rgba(60, 40, 15, 0.07), 0 6px 20px rgba(60, 40, 15, 0.08)',
    landSky1: '#F3E3CC',
    landSky2: '#E8CBA4',
    landSun: '#E39A45',
    land1: '#CDB79A',
    land2: '#A98C6A',
    land3: '#7C8858',
    land4: '#4D5A39',
    modRead: '#2E6A39',
    modMemory: '#9A3A2C',
    modLearn: '#3E5E8A',
    modApply: '#8C4A1E',
  },
  pastel: {
    scheme: 'light',
    bg: '#F7F4FA',
    bgElev: '#FCFAFE',
    surface: '#FFFFFF',
    surface2: '#EFEAF5',
    border: '#E0D8EB',
    borderStrong: '#80759A',
    text: '#262338',
    textMuted: '#565070',
    accent: '#7445AC',
    onAccent: '#FFFFFF',
    accentText: '#6A3D9E',
    accentSoft: '#EDE3F8',
    focus: '#A8336A',
    danger: '#AE2538',
    dangerSoft: '#FBE4E8',
    success: '#24725A',
    successSoft: '#DDF2EA',
    warning: '#7A5908',
    warningSoft: '#F7EDCF',
    hlImportant: '#FFE9A3',
    hlQuestion: '#D5E6FF',
    hlDefinition: '#FFD9E4',
    hlExample: '#D6F2E2',
    hlReview: '#E7DCFF',
    hlText: '#262338',
    overlay: 'rgba(38, 35, 56, 0.45)',
    shadow: '0 1px 2px rgba(50, 30, 80, 0.06), 0 6px 20px rgba(50, 30, 80, 0.07)',
    landSky1: '#F6E4F0',
    landSky2: '#E2D5F2',
    landSun: '#F2A9BF',
    land1: '#D0C3E9',
    land2: '#B3A3DA',
    land3: '#998BC8',
    land4: '#6E61A2',
    modRead: '#24725A',
    modMemory: '#AE2F5C',
    modLearn: '#3D5DB0',
    modApply: '#7445AC',
  },
  gece: {
    scheme: 'dark',
    bg: '#0E1524',
    bgElev: '#121B2D',
    surface: '#162036',
    surface2: '#1E2A44',
    border: '#2A3756',
    borderStrong: '#7282A6',
    text: '#E8EDF6',
    textMuted: '#AAB5CB',
    accent: '#F2A65A',
    onAccent: '#1A1206',
    accentText: '#F5B574',
    accentSoft: '#3A2C1E',
    focus: '#7DB3FF',
    danger: '#FF8A80',
    dangerSoft: '#3D1F22',
    success: '#6FD3A0',
    successSoft: '#163527',
    warning: '#F3C969',
    warningSoft: '#3A3018',
    hlImportant: '#5C4A10',
    hlQuestion: '#1F3E66',
    hlDefinition: '#5E2A22',
    hlExample: '#1F4A30',
    hlReview: '#3F2D63',
    hlText: '#F3F6FB',
    overlay: 'rgba(3, 6, 14, 0.65)',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35)',
    landSky1: '#13203A',
    landSky2: '#2A3A62',
    landSun: '#F4E7C5',
    land1: '#34456F',
    land2: '#273760',
    land3: '#1B2848',
    land4: '#111A33',
    modRead: '#6FD3C0',
    modMemory: '#FF9AA8',
    modLearn: '#8DB8FF',
    modApply: '#F5B574',
  },
  ametist: {
    scheme: 'dark',
    bg: '#15112A',
    bgElev: '#191431',
    surface: '#1E1838',
    surface2: '#282046',
    border: '#372D5E',
    borderStrong: '#8274B2',
    text: '#EEE9FB',
    textMuted: '#BAB0D7',
    accent: '#C9A4FF',
    onAccent: '#1B1030',
    accentText: '#D3B6FF',
    accentSoft: '#3A2B5E',
    focus: '#FFB86B',
    danger: '#FF8FA3',
    dangerSoft: '#3F1E30',
    success: '#7FE0B0',
    successSoft: '#173A2E',
    warning: '#F5CF73',
    warningSoft: '#3B321B',
    hlImportant: '#5A4A14',
    hlQuestion: '#23396A',
    hlDefinition: '#5C2639',
    hlExample: '#1F4936',
    hlReview: '#4A3380',
    hlText: '#F6F3FF',
    overlay: 'rgba(8, 5, 20, 0.65)',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.4)',
    landSky1: '#2A1E4E',
    landSky2: '#5C4088',
    landSun: '#F3B37A',
    land1: '#6E549B',
    land2: '#554182',
    land3: '#3F3068',
    land4: '#291F48',
    modRead: '#7FE0C8',
    modMemory: '#FF9CC0',
    modLearn: '#9DB8FF',
    modApply: '#F3B37A',
  },
  kontrast: {
    scheme: 'dark',
    bg: '#000000',
    bgElev: '#000000',
    surface: '#0B0B0B',
    surface2: '#161616',
    border: '#BDBDBD',
    borderStrong: '#FFFFFF',
    text: '#FFFFFF',
    textMuted: '#E2E2E2',
    accent: '#FFD400',
    onAccent: '#000000',
    accentText: '#FFD400',
    accentSoft: '#2B2500',
    focus: '#00E5FF',
    danger: '#FF7B7B',
    dangerSoft: '#2A0000',
    success: '#5CFF9D',
    successSoft: '#00240F',
    warning: '#FFD400',
    warningSoft: '#2B2500',
    hlImportant: '#FFE14D',
    hlQuestion: '#8FD3FF',
    hlDefinition: '#FFB3A1',
    hlExample: '#9BF5B5',
    hlReview: '#D8C2FF',
    hlText: '#000000',
    overlay: 'rgba(0, 0, 0, 0.8)',
    shadow: 'none',
    landSky1: '#000000',
    landSky2: '#141414',
    landSun: '#FFD400',
    land1: '#4A4A4A',
    land2: '#333333',
    land3: '#222222',
    land4: '#111111',
    modRead: '#5CFFE0',
    modMemory: '#FF9AB0',
    modLearn: '#8FD3FF',
    modApply: '#FFD400',
  },
};

type AccentSet = Pick<ThemeTokens, 'accent' | 'onAccent' | 'accentText' | 'accentSoft'>;

/** Renk tonu seçenekleri; açık ve koyu temalar için ayrı, kontrastı doğrulanmış değerler. */
export const ACCENTS: Record<Exclude<AccentId, 'theme'>, { light: AccentSet; dark: AccentSet }> = {
  orange: {
    light: { accent: '#B5501A', onAccent: '#FFFFFF', accentText: '#A3461A', accentSoft: '#FBE8DA' },
    dark: { accent: '#F2A65A', onAccent: '#1A1206', accentText: '#F5B574', accentSoft: '#3A2C1E' },
  },
  sea: {
    light: { accent: '#1B6680', onAccent: '#FFFFFF', accentText: '#175C74', accentSoft: '#DDF0F6' },
    dark: { accent: '#6CC4E0', onAccent: '#06171D', accentText: '#7FCDE6', accentSoft: '#173845' },
  },
  green: {
    light: { accent: '#2B6F3A', onAccent: '#FFFFFF', accentText: '#276535', accentSoft: '#DFF1E2' },
    dark: { accent: '#7FD38F', onAccent: '#08180C', accentText: '#8FDA9E', accentSoft: '#1D3B24' },
  },
  purple: {
    light: { accent: '#7445AC', onAccent: '#FFFFFF', accentText: '#6A3D9E', accentSoft: '#EDE3F8' },
    dark: { accent: '#C9A4FF', onAccent: '#1B1030', accentText: '#D3B6FF', accentSoft: '#3A2B5E' },
  },
};

export function resolveTheme(theme: ThemeId, prefersDark: boolean): ConcreteTheme {
  if (theme === 'system') return prefersDark ? 'gece' : 'aydinlik';
  return theme;
}

export function tokensFor(theme: ConcreteTheme, accent: AccentId): ThemeTokens {
  const base = THEMES[theme];
  if (accent === 'theme' || theme === 'kontrast') return base;
  return { ...base, ...ACCENTS[accent][base.scheme] };
}

const kebab = (s: string) => s.replace(/[A-Z0-9]/g, (m) => `-${m.toLowerCase()}`).replace(/-(\d)/, '$1');

/** Token'ları CSS değişkenlerine uygular. */
export function applyTokens(el: HTMLElement, tokens: ThemeTokens, themeId: ConcreteTheme): void {
  for (const [k, v] of Object.entries(tokens)) {
    if (k === 'scheme') continue;
    el.style.setProperty(`--${kebab(k)}`, v);
  }
  el.style.colorScheme = tokens.scheme;
  el.dataset.theme = themeId;
  el.dataset.scheme = tokens.scheme;
}

/* ---------- WCAG kontrast hesabı ---------- */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
