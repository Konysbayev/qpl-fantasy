import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeamPick, TeamView } from '../../../packages/core/src/api-types.js';
import type { Position } from '../../../packages/core/src/types.js';
import type { ClubRow } from '../src/api.js';
import { formatDeadline } from '../src/format.js';
import { LangProvider } from '../src/i18n/useT.js';
import { Team } from '../src/screens/Team.js';
import { ThemeProvider } from '../src/theme/ThemeProvider.js';

afterEach(cleanup);

const CLUBS = new Map<string, ClubRow>([
  ['c1', { id: 'c1', sourceId: 13, nameRu: 'Кайрат', nameKz: 'Қайрат', code: 'ҚАЙ', logoUrl: '/clubs/13.png', kit: { shirt: '#F4C430', sleeves: '#F4C430', trim: '#141414', stripes: '#141414', strip: ['#F4C430', '#141414'] } }],
  ['c2', { id: 'c2', sourceId: 51, nameRu: 'Актобе', nameKz: 'Ақтөбе', code: 'АҚТ', logoUrl: '/clubs/51.png', kit: null }]
]);

// Схема 1-3-4-3, запас: ҚҚ, ҚОР, ҚОР, ЖҚ; капитан — ЖҚ в 5-м слоте (5 очков), вице — ШАБ в 9-м
const LAYOUT: Position[] = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'GK', 'DEF', 'DEF', 'MID'];
function picks(): TeamPick[] {
  return LAYOUT.map((position, i) => ({
    playerId: `p${i + 1}`, slot: i + 1, isCaptain: i + 1 === 5, isVice: i + 1 === 9, firstName: 'Имя', lastName: `Фамилия${i + 1}`,
    position, clubId: i % 2 ? 'c2' : 'c1', price: 50, points: i + 1 === 5 ? 5 : 1
  }));
}
function view(over: Partial<TeamView> = {}): TeamView {
  return {
    next: { id: 'g13', number: 13, deadline: '2026-10-24T09:00:00.000Z' },
    last: { number: 12, status: 'finished', points: 67, penalty: 0, captainId: 'p5', subsIn: [] },
    squad: { gameweek: 13, bank: 15, freeTransfers: 1, unlimited: false, wildcardActive: false, wildcardAvailable: true, penalty: 0 },
    picks: picks(),
    ...over
  };
}

function setup(v: TeamView = view(), saveResult: unknown = { ok: true, value: null }) {
  const saveLineup = vi.fn().mockResolvedValue(saveResult);
  const onPlayer = vi.fn();
  const onChanged = vi.fn();
  render(
    <ThemeProvider>
      <LangProvider lang="kk">
        <Team view={v} clubs={CLUBS} api={{ saveLineup }} onPlayer={onPlayer} onChanged={onChanged} />
      </LangProvider>
    </ThemeProvider>
  );
  return { saveLineup, onPlayer, onChanged };
}

const player = (n: number) => screen.getByRole('button', { name: new RegExp(`^Фамилия${n},`) });

describe('formatDeadline', () => {
  it('время по Алматы (UTC+5): «13-тур · 24 қаз, 14:00» / «Тур 13 · 24 окт, 14:00»', () => {
    expect(formatDeadline(13, '2026-10-24T09:00:00.000Z', 'kk')).toBe('13-тур · 24 қаз, 14:00');
    expect(formatDeadline(13, '2026-10-24T09:00:00.000Z', 'ru')).toBe('Тур 13 · 24 окт, 14:00');
    expect(formatDeadline(1, '2026-12-31T19:30:00.000Z', 'kk')).toBe('1-тур · 1 қаң, 00:30');
  });
});

describe('Team', () => {
  it('показывает 11 на поле и 4 в запасе, очки тура и дедлайн', () => {
    setup();
    expect(within(screen.getByTestId('pitch')).getAllByRole('button')).toHaveLength(11);
    expect(within(screen.getByTestId('bench')).getAllByRole('button', { name: /^Фамилия/ })).toHaveLength(4);
    expect(screen.getByTestId('gw-points').textContent).toBe('67');
    expect(screen.getByText('13-тур · 24 қаз, 14:00')).toBeTruthy();
    expect(screen.getByText('12-тур')).toBeTruthy();
  });

  it('у капитана тура очки ×2, у остальных — как есть; штраф вычитается из суммы', () => {
    setup(view({ last: { number: 12, status: 'finished', points: 67, penalty: -4, captainId: 'p5', subsIn: [] } }));
    expect(within(player(5)).getByText('10')).toBeTruthy();
    expect(within(player(6)).getByText('1')).toBeTruthy();
    expect(screen.getByTestId('gw-points').textContent).toBe('63');
  });

  it('нажатие на игрока открывает карточку', () => {
    const { onPlayer } = setup();
    fireEvent.click(player(3));
    expect(onPlayer).toHaveBeenCalledWith('p3');
  });

  it('недопустимая замена (останется 2 защитника) не отправляется и показывает подсказку', async () => {
    const { saveLineup } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ауыстыру' }));
    fireEvent.click(player(2));
    fireEvent.click(player(15));
    expect(saveLineup).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Схема жарамсыз');
  });

  it('допустимая замена отправляет состав с новым порядком; роль капитана остаётся на поле', async () => {
    const { saveLineup, onChanged } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ауыстыру' }));
    fireEvent.click(player(5));
    fireEvent.click(player(15));
    await waitFor(() => expect(saveLineup).toHaveBeenCalledOnce());
    const sent = saveLineup.mock.calls[0][0];
    expect(sent.gameweek).toBe(13);
    expect(sent.picks.find((p: { slot: number }) => p.slot === 5)).toEqual({ playerId: 'p15', slot: 5, isCaptain: true, isVice: false });
    expect(sent.picks.find((p: { slot: number }) => p.slot === 15)).toEqual({ playerId: 'p5', slot: 15, isCaptain: false, isVice: false });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('ошибка deadline_passed показывает «Дедлайн өтті»', async () => {
    setup(view(), { ok: false, error: 'deadline_passed' });
    fireEvent.click(screen.getByRole('button', { name: 'Ауыстыру' }));
    fireEvent.click(player(2));
    fireEvent.click(player(13));
    expect(await screen.findByText('Дедлайн өтті')).toBeTruthy();
  });

  it('тура ещё не было — очков нет, вместо них тире', () => {
    setup(view({ last: null, picks: picks().map((p) => ({ ...p, points: null })) }));
    expect(screen.getByTestId('gw-points').textContent).toBe('—');
    expect(within(player(1)).getByText('–')).toBeTruthy();
  });
});
