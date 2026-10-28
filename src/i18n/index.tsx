import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Language } from '../domain/types';
import { en } from './en';
import { tr, type Dict } from './tr';

export type Params = Record<string, string | number>;
export type TFunc = (key: string, params?: Params) => string;

const DICTS: Record<Language, Dict> = { tr, en };

function lookup(dict: Dict, key: string): string | undefined {
  let cur: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur === 'string') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

const missingReported = new Set<string>();

/**
 * Çeviri: önce seçili dil, eksikse İngilizce, o da yoksa Türkçe (kaynak dil).
 * Eksik çeviriler geliştirme modunda bildirilir. `{ad}` biçimli parametreler yerleştirilir.
 * `count` parametresi verilirse `anahtar_one` / `anahtar_other` çoğul biçimleri aranır.
 */
export function translate(lang: Language, key: string, params?: Params): string {
  const order: Language[] = lang === 'en' ? ['en', 'tr'] : [lang, 'en', 'tr'];
  let found: string | undefined;
  for (const l of order) {
    const d = DICTS[l];
    if (params && typeof params.count === 'number') {
      const form = new Intl.PluralRules(l).select(params.count);
      found = lookup(d, `${key}_${form}`) ?? lookup(d, `${key}_other`);
    }
    found ??= lookup(d, key);
    if (found != null) {
      if (l !== lang && import.meta.env?.DEV && !missingReported.has(`${lang}:${key}`)) {
        missingReported.add(`${lang}:${key}`);
        console.warn(`[i18n] eksik çeviri (${lang}): ${key}`);
      }
      break;
    }
  }
  if (found == null) return key;
  return params ? found.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] != null ? String(params[k]) : `{${k}}`)) : found;
}

export interface I18n {
  lang: Language;
  t: TFunc;
  locale: string;
  formatDate: (iso: string | Date, opts?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
  formatRelativeDays: (days: number) => string;
}

export function createI18n(lang: Language): I18n {
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US';
  const dtf = new Map<string, Intl.DateTimeFormat>();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return {
    lang,
    locale,
    t: (key, params) => translate(lang, key, params),
    formatDate: (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
      const k = JSON.stringify(opts);
      if (!dtf.has(k)) dtf.set(k, new Intl.DateTimeFormat(locale, opts));
      return dtf.get(k)!.format(typeof iso === 'string' ? new Date(iso) : iso);
    },
    formatNumber: (n, opts) => new Intl.NumberFormat(locale, opts).format(n),
    formatRelativeDays: (days) => rtf.format(days, 'day'),
  };
}

const I18nContext = createContext<I18n>(createI18n('tr'));

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  const value = useMemo(() => createI18n(lang), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
