import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeamPick, TeamView } from '../../../packages/core/src/api-types.js';
import type { Position } from '../../../packages/core/src/types.js';
import type { ClubRow, FixtureRow } from '../src/api.js';
import { LangProvider } from '../src/i18n/useT.js';
import { PlayerCard, type CardPlayer } from '../src/screens/PlayerCard.js';
import { standings } from '../src/standings.js';
import { ThemeProvider } from '../src/theme/ThemeProvider.js';

afterEach(cleanup);

const kit = (shirt: string) => ({ shirt, sleeves: shirt, trim: '#FFFFFF', stripes: null, strip: [shirt, '#FFFFFF'] as [string, string] });
const CLUBS = new Map<string, ClubRow>([
  ['a', { id: 'a', sourceId: 1, nameRu: 'Кайрат', nameKz: 'Қайрат', code: 'ҚАЙ', logoUrl: '/clubs/13.png', kit: kit('#F4C430') }],
  ['b', { id: 'b', sourceId: 2, nameRu: 'Елимай', nameKz: 'Елімай', code: 'ЕЛМ', logoUrl: '/clubs/93.webp', kit: kit('#17673F') }],
  ['c', { id: 'c', sourceId: 3, nameRu: 'Тобыл', nameKz: 'Тобыл', code: 'ТОБ', logoUrl: '/clubs/90.png', kit: kit('#1B8A3C') }]
]);

const fx = (id: string, gw: number, home: string, away: string, status: string, hs: number | null = null, as: number | null = null): FixtureRow => ({
  id, gameweek: gw, kickoff: `2026-0${Math.min(gw, 9)}-1${gw % 10}T12:00:00.000Z`, status, homeClubId: home, awayClubId: away, homeScore: hs, awayScore: as
});
// Таблица: Қайрат 1-й (2 победы), Тобыл 2-й, Елімай 3-й
const FIXTURES: FixtureRow[] = [
  fx('f1', 1, 'a', 'b', 'finished', 2, 0), fx('f2', 2, 'c', 'a', 'finished', 0, 1), fx('f3', 3, 'b', 'c', 'finished', 1, 1),
  fx('f4', 4, 'a', 'b', 'upcoming'), fx('f5', 5, 'b', 'c', 'upcoming'), fx('f6', 6, 'c', 'b', 'upcoming'), fx('f7', 7, 'b', 'a', 'upcoming')
];

const LAYOUT: Position[] = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'GK', 'DEF', 'MID', 'FWD'];
const PICKS: TeamPick[] = LAYOUT.map((position, i) => ({
  playerId: `p${i + 1}`, slot: i + 1, isCaptain: i + 1 === 6, isVice: i + 1 === 10, firstName: 'Ерасыл', lastName: `Фамилия${i + 1}`, position, clubId: 'b', price: 60, points: 1
}));
const VIEW: TeamView = { next: { id: 'g4', number: 4, deadline: '2026-04-14T09:00:00.000Z' }, last: null, squad: { gameweek: 4, bank: 0, freeTransfers: 1, unlimited: false, wildcardActive: false, wildcardAvailable: true, penalty: 0 }, picks: PICKS };

function setup(player: CardPlayer, saveResult: unknown = { ok: true, value: null }) {
  const api = {
    seasonStats: vi.fn().mockResolvedValue({ points: 64, minutes: 1020, appearances: 12, goals: 2, assists: 3, cleanSheets: 5, yellow: 1, red: 0 }),
    playerMatches: vi.fn().mockResolvedValue([1, 2, 3].map((gw) => ({ gameweek: gw, points: gw * 3, minutes: 90, kickoff: FIXTURES[gw - 1].kickoff }))),
    fixtures: vi.fn().mockResolvedValue(FIXTURES),
    saveLineup: vi.fn().mockResolvedValue(saveResult)
  };
  const onClose = vi.fn();
  const onTransferOut = vi.fn();
  const onChanged = vi.fn();
  render(
    <ThemeProvider>
      <LangProvider lang="kk">
        <PlayerCard player={player} view={VIEW} clubs={CLUBS} api={api} onClose={onClose} onTransferOut={onTransferOut} onChanged={onChanged} />
      </LangProvider>
    </ThemeProvider>
  );
  return { api, onClose, onTransferOut, onChanged };
}

const inSquad = (slot: number): CardPlayer => {
  const p = PICKS[slot - 1];
  return { id: p.playerId, firstName: p.firstName, lastName: p.lastName, position: p.position, clubId: p.clubId, price: p.price, selectedPct: 24 };
};

describe('standings', () => {
  it('места по очкам (3 за победу), затем по разнице мячей', () => {
    expect([...standings(FIXTURES, ['a', 'b', 'c']).entries()]).toEqual([['a', 1], ['c', 2], ['b', 3]]);
  });
});

describe('PlayerCard', () => {
  it('баннер, 6 показателей сезона, последние туры', async () => {
    setup(inSquad(2));
    const dialog = screen.getByRole('dialog', { name: /Фамилия2/ });
    expect(within(dialog).getByText('Фамилия2')).toBeTruthy();
    expect(within(dialog).getByText('6.0 млн')).toBeTruthy();
    expect(within(dialog).getByText('24% таңдаған')).toBeTruthy();
    expect(await within(dialog).findByText('1 020')).toBeTruthy();
    for (const label of ['Ұпай', 'Гол', 'Ассист', 'Құрғақ ойын', 'Минут', 'Сары карта']) expect(within(dialog).getByText(label)).toBeTruthy();
    expect(within(dialog).getByText('3-тур')).toBeTruthy();
    expect(within(dialog).getByText('9')).toBeTruthy();
  });

  it('сложность следующих матчей выводится словом, не только цветом', async () => {
    setup(inSquad(2));
    // Елімай: 4-й тур в гостях у Қайрата (1-е место — трудный), 5-й дома с Тобылом (2-е — средний), 6-й в гостях у Тобыла
    const rows = await screen.findAllByTestId('next-fixture');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('4-тур')).toBeTruthy();
    expect(within(rows[0]).getByText('Қайрат')).toBeTruthy();
    expect(within(rows[0]).getByText('қонақта')).toBeTruthy();
    expect(within(rows[0]).getByText('Қиын')).toBeTruthy();
    expect(within(rows[1]).getByText('үйде')).toBeTruthy();
    expect(within(rows[1]).getByText('Орташа')).toBeTruthy();
  });

  it('«Капитан ету» отправляет состав с новым капитаном, прежний капитан — обычный игрок', async () => {
    const { api, onChanged } = setup(inSquad(2));
    fireEvent.click(screen.getByRole('button', { name: 'Капитан ету' }));
    await waitFor(() => expect(api.saveLineup).toHaveBeenCalledOnce());
    const { gameweek, picks } = api.saveLineup.mock.calls[0][0];
    expect(gameweek).toBe(4);
    expect(picks.filter((p: { isCaptain: boolean }) => p.isCaptain).map((p: { playerId: string }) => p.playerId)).toEqual(['p2']);
    expect(picks.find((p: { playerId: string }) => p.playerId === 'p6')).toMatchObject({ isCaptain: false, isVice: false });
    expect(picks.find((p: { playerId: string }) => p.playerId === 'p10')).toMatchObject({ isVice: true });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('вице-капитан становится капитаном — роли меняются местами', async () => {
    const { api } = setup(inSquad(10));
    fireEvent.click(screen.getByRole('button', { name: 'Капитан ету' }));
    await waitFor(() => expect(api.saveLineup).toHaveBeenCalledOnce());
    const { picks } = api.saveLineup.mock.calls[0][0];
    expect(picks.find((p: { playerId: string }) => p.playerId === 'p10')).toMatchObject({ isCaptain: true, isVice: false });
    expect(picks.find((p: { playerId: string }) => p.playerId === 'p6')).toMatchObject({ isCaptain: false, isVice: true });
  });

  it('у игрока не из состава кнопок капитана и трансфера нет', async () => {
    setup({ id: 'stranger', firstName: 'Марк', lastName: 'Гуаль', position: 'MID', clubId: 'a', price: 100, selectedPct: null });
    await screen.findAllByTestId('next-fixture');
    expect(screen.queryByRole('button', { name: 'Капитан ету' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Вице-капитан' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Трансферге шығару' })).toBeNull();
  });

  it('«Трансферге шығару» открывает трансфер с этим игроком; «Жабу» закрывает', () => {
    const { onTransferOut, onClose } = setup(inSquad(13));
    expect(screen.queryByRole('button', { name: 'Капитан ету' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Трансферге шығару' }));
    expect(onTransferOut).toHaveBeenCalledWith('p13');
    fireEvent.click(screen.getByRole('button', { name: 'Жабу' }));
    expect(onClose).toHaveBeenCalled();
  });
});
