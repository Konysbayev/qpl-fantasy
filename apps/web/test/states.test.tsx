import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeamView } from '../../../packages/core/src/api-types.js';
import { OfflineBanner } from '../src/components/OfflineBanner.js';
import { useAutoRefresh } from '../src/hooks.js';
import { LangProvider } from '../src/i18n/useT.js';
import { Team } from '../src/screens/Team.js';
import { ThemeProvider } from '../src/theme/ThemeProvider.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const wrap = (node: JSX.Element) => render(<ThemeProvider><LangProvider lang="kk">{node}</LangProvider></ThemeProvider>);
const base: TeamView = { next: null, last: null, squad: null, picks: [] };

describe('пустые и особые состояния', () => {
  it('нет интернета — плашка появляется и исчезает', () => {
    wrap(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status').textContent).toBe('Интернет жоқ — деректер қосылғанда жаңарады');
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('туров больше нет — «Маусым аяқталды» вместо дедлайна, замены выключены', () => {
    wrap(<Team view={{ ...base, last: { number: 30, status: 'finished', points: 50, penalty: 0, captainId: null, subsIn: [] } }} clubs={new Map()} api={{ saveLineup: vi.fn() }} onPlayer={() => {}} onChanged={() => {}} />);
    expect(screen.getByText('Маусым аяқталды')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ауыстыру' })).toBeNull();
  });

  it('тур идёт — LIVE и подсказка, что очки обновляются', () => {
    wrap(<Team view={{ ...base, next: { id: 'g', number: 13, deadline: '2026-10-31T09:00:00.000Z' }, last: { number: 12, status: 'live', points: 20, penalty: 0, captainId: null, subsIn: [] } }} clubs={new Map()} api={{ saveLineup: vi.fn() }} onPlayer={() => {}} onChanged={() => {}} />);
    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByText('Ұпайлар бірнеше минут сайын жаңарады')).toBeTruthy();
  });

  it('автообновление: пока включено — раз в интервал, выключили — перестаёт', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const { rerender } = renderHook(({ on }) => useAutoRefresh(on, fn, 120_000), { initialProps: { on: true } });
    vi.advanceTimersByTime(240_000);
    expect(fn).toHaveBeenCalledTimes(2);
    rerender({ on: false });
    vi.advanceTimersByTime(240_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
