// Пішімдеу: Алматы уақыты (UTC+5, ICU-дағы ескі белдеуге тәуелсіз), баға, позиция қысқартулары.
import type { Position } from '../../../packages/core/src/types.js';
import { translate, type Lang } from './i18n/useT.js';

const ALMATY_MS = 5 * 3_600_000;
const MONTHS: Record<Lang, string[]> = {
  kk: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'],
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
};

export const POS_LABEL: Record<Lang, Record<Position, string>> = {
  kk: { GK: 'ҚҚ', DEF: 'ҚОР', MID: 'ЖҚ', FWD: 'ШАБ' },
  ru: { GK: 'ВР', DEF: 'ЗАЩ', MID: 'ПЗ', FWD: 'НАП' }
};

export function almaty(iso: string): { day: number; month: number; time: string; date: string } {
  const d = new Date(Date.parse(iso) + ALMATY_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { day: d.getUTCDate(), month: d.getUTCMonth(), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`, date: d.toISOString().slice(0, 10) };
}

export function formatDay(iso: string, lang: Lang): string {
  const a = almaty(iso);
  return `${a.day} ${MONTHS[lang][a.month]}`;
}

export function formatDate(iso: string, lang: Lang): string {
  const a = almaty(iso);
  return `${a.day} ${MONTHS[lang][a.month]}, ${a.time}`;
}

export function formatDeadline(gameweek: number, iso: string, lang: Lang): string {
  return `${translate(lang)('tourN', { n: gameweek })} · ${formatDate(iso, lang)}`;
}

// Ақша миллионның оннан бір бөлігімен: 65 → «6.5»
export const price = (tenths: number): string => (tenths / 10).toFixed(1);
