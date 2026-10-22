import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DARK, LIGHT } from '../src/theme/tokens.js';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider.js';
import { fakeTelegram } from './telegram-fake.js';

afterEach(() => {
  cleanup();
  delete (window as { Telegram?: unknown }).Telegram;
});

function Probe() {
  const t = useTheme();
  return <div data-testid="bg">{t.bg}</div>;
}

describe('тема', () => {
  it('токены светлой и тёмной темы из спецификации 3.1', () => {
    expect(DARK.bg).toBe('#0E1621');
    expect(LIGHT.bg).toBe('#EAF2F8');
    expect([LIGHT.primary, LIGHT.lip, DARK.primary, DARK.lip]).toEqual(['#0A74AA', '#075A85', '#176C99', '#0F4E70']);
    expect([LIGHT.gold, LIGHT.goldLip, DARK.gold, DARK.goldLip]).toEqual(['#F5BF2E', '#C48A08', '#F2C14E', '#B98A1C']);
    expect([LIGHT.grass1, LIGHT.grass2, DARK.grass1, DARK.grass2]).toEqual(['#52B66F', '#4BAE67', '#2B7A48', '#276F42']);
  });

  it('тёмная схема Telegram → тёмные токены; смена темы перерисовывает', () => {
    const tg = fakeTelegram({ colorScheme: 'dark' });
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('bg').textContent).toBe('#0E1621');

    act(() => tg.setScheme('light'));
    expect(screen.getByTestId('bg').textContent).toBe('#EAF2F8');
  });

  it('вне Telegram — светлая тема', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('bg').textContent).toBe(LIGHT.bg);
  });
});
