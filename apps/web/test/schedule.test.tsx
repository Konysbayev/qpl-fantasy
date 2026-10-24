import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClubRow, FixtureRow, GameweekRow } from '../src/api.js';
import { LangProvider, type Lang } from '../src/i18n/useT.js';
import { LeaguesSoon } from '../src/screens/LeaguesSoon.js';
import { Profile } from '../src/screens/Profile.js';
import { Schedule } from '../src/screens/Schedule.js';
import { ThemeProvider } from '../src/theme/ThemeProvider.js';

afterEach(cleanup);

const CLUBS = new Map<string, ClubRow>([
  ['a', { id: 'a', sourceId: 1, nameRu: 'Кайрат', nameKz: 'Қайрат', code: 'ҚАЙ', logoUrl: '/clubs/13.png', kit: null }],
  ['b', { id: 'b', sourceId: 2, nameRu: 'Актобе', nameKz: 'Ақтөбе', code: 'АҚТ', logoUrl: '/clubs/51.png', kit: null }],
  ['c', { id: 'c', sourceId: 3, nameRu: 'Тобыл', nameKz: 'Тобыл', code: 'ТОБ', logoUrl: '/clubs/90.png', kit: null }],
  ['d', { id: 'd', sourceId: 4, nameRu: 'Елимай', nameKz: 'Елімай', code: 'ЕЛМ', logoUrl: '/clubs/93.webp', kit: null }]
]);
const GWS: GameweekRow[] = [1, 2, 3].map((n) => ({ id: `g${n}`, number: n, deadline: `2026-10-${10 + n * 7}T09:00:00.000Z` }));
const BY_GW: Record<number, FixtureRow[]> = {
  2: [
    { id: 'f1', gameweek: 2, kickoff: '2026-10-24T10:00:00.000Z', status: 'finished', homeClubId: 'a', awayClubId: 'b', homeScore: 2, awayScore: 0 },
    { id: 'f2', gameweek: 2, kickoff: '2026-10-24T13:30:00.000Z', status: 'live', homeClubId: 'c', awayClubId: 'd', homeScore: 1, awayScore: 1 }
  ],
  3: [{ id: 'f3', gameweek: 3, kickoff: '2026-10-31T09:00:00.000Z', status: 'upcoming', homeClubId: 'd', awayClubId: 'a', homeScore: null, awayScore: null }]
};

function wrap(node: JSX.Element, lang: Lang = 'kk') {
  return render(<ThemeProvider><LangProvider lang={lang}>{node}</LangProvider></ThemeProvider>);
}

describe('Schedule', () => {
  const api = { fixtures: vi.fn(async (gw?: number) => BY_GW[gw ?? 0] ?? []), matchEvents: vi.fn(async () => []) };

  it('сыгранный матч — счёт, идущий — LIVE; стрелкой переключается тур, будущий матч — время по Алматы', async () => {
    wrap(<Schedule gameweeks={GWS} initial={2} clubs={CLUBS} api={api} />);
    expect(screen.getByRole('heading', { name: '2-тур' })).toBeTruthy();
    const first = (await screen.findAllByTestId('fixture'))[0];
    expect(within(first).getByText('Қайрат')).toBeTruthy();
    expect(within(first).getByText('2 : 0')).toBeTruthy();
    expect(within(screen.getAllByTestId('fixture')[1]).getByText('LIVE')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Келесі тур' }));
    expect(screen.getByRole('heading', { name: '3-тур' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('fixture')).toHaveLength(1));
    const next = screen.getByTestId('fixture');
    expect(within(next).getByText('14:00')).toBeTruthy();
    expect(within(next).getByText('Елімай')).toBeTruthy();
    expect(api.fixtures).toHaveBeenLastCalledWith(3);
    expect((screen.getByRole('button', { name: 'Келесі тур' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Алдыңғы тур' }));
    fireEvent.click(screen.getByRole('button', { name: 'Алдыңғы тур' }));
    expect(screen.getByRole('heading', { name: '1-тур' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Алдыңғы тур' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('на русском: «Тур 2», названия клубов по-русски', async () => {
    wrap(<Schedule gameweeks={GWS} initial={2} clubs={CLUBS} api={api} />, 'ru');
    expect(screen.getByRole('heading', { name: 'Тур 2' })).toBeTruthy();
    expect(within((await screen.findAllByTestId('fixture'))[0]).getByText('Кайрат')).toBeTruthy();
  });
});

describe('Profile', () => {
  it('смена языка сразу меняет подписи', () => {
    const onLang = vi.fn();
    function Host() {
      const [lang, setLang] = useState<Lang>('kk');
      return (
        <ThemeProvider>
          <LangProvider lang={lang}>
            <Profile name="Нұрлан" lang={lang} notify onNotify={() => {}} api={{ saveProfile: vi.fn().mockResolvedValue({ ok: true, value: { lang, notify: true } }) }} onLang={(l) => { onLang(l); setLang(l); }} onClose={() => {}} />
          </LangProvider>
        </ThemeProvider>
      );
    }
    render(<Host />);
    expect(screen.getByText('Тіл')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Русский' }));
    expect(onLang).toHaveBeenCalledWith('ru');
    expect(screen.getByText('Язык')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Русский' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Неофициальная фэнтези-игра, не связана с ПФЛК')).toBeTruthy();
  });
});

describe('LeaguesSoon', () => {
  it('карточка «Жақында: мини-лигалар»', () => {
    wrap(<LeaguesSoon />);
    expect(screen.getByText('Жақында: мини-лигалар')).toBeTruthy();
  });
});

describe('перенесённый тур', () => {
  // 23-й тур целиком перенесли на 17 октября: он идёт после 28-го (10 октября) и перед 29-м
  const MOVED: GameweekRow[] = [
    { id: 'g22', number: 22, deadline: '2026-08-15T12:00:00.000Z' },
    { id: 'g23', number: 23, deadline: '2026-10-17T09:00:00.000Z' },
    { id: 'g24', number: 24, deadline: '2026-08-29T11:00:00.000Z' },
    { id: 'g28', number: 28, deadline: '2026-10-10T09:00:00.000Z' },
    { id: 'g29', number: 29, deadline: '2026-10-24T09:00:00.000Z' }
  ];
  it('туры листаются в порядке игры: 28 → 23 (с пометкой «перенесён») → 29', async () => {
    const api = { fixtures: vi.fn(async () => []), matchEvents: vi.fn(async () => []) };
    wrap(<Schedule gameweeks={MOVED} initial={28} clubs={CLUBS} api={api} />, 'ru');
    expect(screen.getByRole('heading', { name: 'Тур 28' })).toBeTruthy();
    expect(screen.queryByText(/Перенесён/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий тур' }));
    expect(screen.getByRole('heading', { name: 'Тур 23' })).toBeTruthy();
    expect(screen.getByText('Перенесён · 17 окт')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий тур' }));
    expect(screen.getByRole('heading', { name: 'Тур 29' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий тур' }));
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий тур' }));
    expect(screen.getByRole('heading', { name: 'Тур 28' })).toBeTruthy();
  });
});
