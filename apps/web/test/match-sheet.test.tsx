import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClubRow, FixtureRow, MatchEventRow } from '../src/api.js';
import { LangProvider } from '../src/i18n/useT.js';
import { MatchSheet } from '../src/screens/MatchSheet.js';
import { Schedule } from '../src/screens/Schedule.js';
import { ThemeProvider } from '../src/theme/ThemeProvider.js';

afterEach(cleanup);
const wrap = (node: JSX.Element) => render(<ThemeProvider><LangProvider lang="ru">{node}</LangProvider></ThemeProvider>);
const club = (id: string, nameRu: string): ClubRow => ({ id, sourceId: null, nameRu, nameKz: null, code: id, logoUrl: null, kit: null });
const CLUBS = new Map([['h', club('h', 'Кайрат')], ['a', club('a', 'Астана')]]);
const FIX: FixtureRow = { id: 'fx1', gameweek: 29, kickoff: '2026-10-24T10:00:00Z', status: 'finished', homeClubId: 'h', awayClubId: 'a', homeScore: 2, awayScore: 1 };
const EVENTS: MatchEventRow[] = [
  { minute: 12, kind: 'goal', clubId: 'h', player: 'Д. Сатпаев', other: 'И. Чесноков' },
  { minute: 30, kind: 'yellow', clubId: 'a', player: 'М. Томасевич', other: null },
  { minute: 55, kind: 'penalty_goal', clubId: 'a', player: 'Б. Тошев', other: null },
  { minute: 61, kind: 'sub', clubId: 'h', player: 'Ж. Нуриддинов', other: 'Д. Сатпаев' },
  { minute: 88, kind: 'own_goal', clubId: 'a', player: 'А. Беглов', other: null },
  { minute: 90, kind: 'red', clubId: 'a', player: 'К. Ерлан', other: null }
];

describe('MatchSheet', () => {
  it('голы с пасом, пенальти, автогол, карточки и замены по минутам', async () => {
    wrap(<MatchSheet fixture={FIX} clubs={CLUBS} api={{ matchEvents: vi.fn().mockResolvedValue(EVENTS) }} onClose={() => {}} />);
    const items = await screen.findAllByTestId('event');
    expect(items).toHaveLength(6);
    expect(within(items[0]).getByText("12'")).toBeTruthy();
    expect(within(items[0]).getByText('Д. Сатпаев')).toBeTruthy();
    expect(within(items[0]).getByText('пас: И. Чесноков')).toBeTruthy();
    expect(within(items[2]).getByText('пенальти')).toBeTruthy();
    expect(within(items[3]).getByText('Ж. Нуриддинов')).toBeTruthy();
    expect(within(items[3]).getByText('вместо Д. Сатпаев')).toBeTruthy();
    expect(within(items[4]).getByText('автогол')).toBeTruthy();
    expect(items[0].getAttribute('data-side')).toBe('home');
    expect(items[1].getAttribute('data-side')).toBe('away');
    expect(screen.getByText('2 : 1')).toBeTruthy();
  });

  it('событий нет — понятная надпись', async () => {
    wrap(<MatchSheet fixture={{ ...FIX, status: 'upcoming', homeScore: null, awayScore: null }} clubs={CLUBS} api={{ matchEvents: vi.fn().mockResolvedValue([]) }} onClose={() => {}} />);
    expect(await screen.findByText('Событий пока нет')).toBeTruthy();
  });
});

describe('Schedule → ход матча', () => {
  it('нажатие на сыгранный матч открывает ход матча', async () => {
    const api = { fixtures: vi.fn().mockResolvedValue([FIX]), matchEvents: vi.fn().mockResolvedValue(EVENTS) };
    wrap(<Schedule gameweeks={[{ id: 'g29', number: 29, deadline: null }]} initial={29} clubs={CLUBS} api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: /Кайрат.*Астана/ }));
    expect(await screen.findAllByTestId('event')).toHaveLength(6);
    expect(api.matchEvents).toHaveBeenCalledWith('fx1');
  });
});
