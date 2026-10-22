import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { kk } from '../src/i18n/kk.js';
import { ru } from '../src/i18n/ru.js';
import { LangProvider, detectLang, useT } from '../src/i18n/useT.js';

afterEach(cleanup);

describe('языки', () => {
  it('словари kk и ru имеют одинаковые ключи и непустые тексты', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(kk).sort());
    for (const d of [kk, ru]) for (const v of Object.values(d)) expect(v.trim()).not.toBe('');
  });

  it('language_code ru → русский; kk, en или нет → казахский', () => {
    expect(detectLang('ru')).toBe('ru');
    expect(detectLang('kk')).toBe('kk');
    expect(detectLang('en')).toBe('kk');
    expect(detectLang(null)).toBe('kk');
  });

  it('useT отдаёт текст на выбранном языке', () => {
    function Probe() {
      const t = useT();
      return <span>{t('deadlinePassed')}</span>;
    }
    render(<LangProvider lang="ru"><Probe /></LangProvider>);
    expect(screen.getByText(ru.deadlinePassed)).toBeTruthy();
    cleanup();
    render(<LangProvider lang="kk"><Probe /></LangProvider>);
    expect(screen.getByText('Дедлайн өтті')).toBeTruthy();
  });
});
