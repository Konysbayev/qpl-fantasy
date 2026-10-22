// Тіл: Telegram-дағы language_code — ru болса орысша, әйтпесе қазақша; профильде ауыстырылады.
import { createContext, useContext, type ReactNode } from 'react';
import { kk } from './kk.js';
import { ru } from './ru.js';

export type Lang = 'kk' | 'ru';
export type TextKey = keyof typeof kk;
export type T = (key: TextKey, vars?: Record<string, string | number>) => string;

const DICTS: Record<Lang, Record<TextKey, string>> = { kk, ru };
const LangContext = createContext<Lang>('kk');

export function detectLang(languageCode: string | null | undefined): Lang {
  return languageCode === 'ru' ? 'ru' : 'kk';
}

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function translate(lang: Lang): T {
  return (key, vars) => {
    const text = DICTS[lang][key];
    return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
  };
}

export function useT(): T {
  return translate(useLang());
}
