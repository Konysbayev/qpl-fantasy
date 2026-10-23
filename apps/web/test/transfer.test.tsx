import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeamPick, TeamView } from '../../../packages/core/src/api-types.js';
import type { Position } from '../../../packages/core/src/types.js';
import type { ClubRow, PlayerRow } from '../src/api.js';
import { LangProvider } from '../src/i18n/useT.js';
import { Builder } from '../src/screens/Builder.js';
import { Transfer } from '../src/screens/Transfer.js';
import { normalize } from '../src/search.js';
import { ThemeProvider } from '../src/theme/ThemeProvider.js';

afterEach(cleanup);

const KIT = { shirt: '#111111', sleeves: '#111111', trim: '#FFFFFF', stripes: null, strip: ['#111111', '#FFFFFF'] as [string, string] };
const CLUB_NAMES: [string, string, string][] = [['Кайрат', 'Қайрат', 'ҚАЙ'], ['Актобе', 'Ақтөбе', 'АҚТ'], ['Тобыл', 'Тобыл', 'ТОБ'], ['Елимай', 'Елімай', 'ЕЛМ'], ['Ордабасы', 'Ордабасы', 'ОРД'], ['Астана', 'Астана', 'АСТ']];
const CLUBS = new Map<string, ClubRow>(CLUB_NAMES.map(([ru, kz, code], i) => [`c${i}`, { id: `c${i}`, sourceId: i, nameRu: ru, nameKz: kz, code, logoUrl: null, kit: KIT }]));

// Каждому клубу: 1 ВР, 2 ЗАЩ, 2 ПЗ, 1 НАП по 5.0 млн; фамилия = позиция+клуб+номер
const ROSTER: [Position, number][] = [['GK', 0], ['DEF', 0], ['DEF', 1], ['MID', 0], ['MID', 1], ['FWD', 0]];
const PLAYERS: PlayerRow[] = [...CLUBS.keys()].flatMap((clubId, c) =>
  ROSTER.map(([position, n]) => ({ id: `${position}-${c}-${n}`, firstName: 'Имя', lastName: `${position}${c}${n}`, position, clubId, price: 50, status: 'available', points: 10 + c, minutes: 900, selectedPct: 5 }))
);
const P = (pos: Position, c: number, n = 0) => PLAYERS.find((p) => p.id === `${pos}-${c}-${n}`)!;

// Состав: клубы 0–4 по трое (как в серверных тестах), 75.0 млн, банк 25.0
const OWNED = [P('GK', 0), P('DEF', 0), P('DEF', 1), P('DEF', 2), P('DEF', 3), P('MID', 0), P('MID', 1), P('MID', 2), P('MID', 3), P('FWD', 2), P('FWD', 3), P('GK', 1), P('DEF', 4), P('MID', 4), P('FWD', 4)];
function view(over: Partial<NonNullable<TeamView['squad']>> = {}): TeamView {
  const picks: TeamPick[] = OWNED.map((p, i) => ({ playerId: p.id, slot: i + 1, isCaptain: i === 5, isVice: i === 9, firstName: p.firstName, lastName: p.lastName, position: p.position, clubId: p.clubId, price: p.price, points: 1 }));
  return {
    next: { id: 'g2', number: 2, deadline: '2026-03-14T09:00:00.000Z' }, last: null, picks,
    squad: { gameweek: 2, bank: 250, freeTransfers: 1, unlimited: false, wildcardActive: false, wildcardAvailable: true, penalty: 0, ...over }
  };
}

const wrap = (node: JSX.Element) => render(<ThemeProvider><LangProvider lang="kk">{node}</LangProvider></ThemeProvider>);
const confirmButton = () => screen.getByRole('button', { name: /Трансферді растау/ });

describe('normalize', () => {
  it('без регистра и казахских букв: «Қайрат» = «кайрат», «Әбілов» = «абилов»', () => {
    expect(normalize('Қайрат')).toBe(normalize('кайрат'));
    expect(normalize('Әбілов')).toBe('абилов');
    expect(normalize('ҰЛЫТАУ Өскемен Ғани Ңң Үү Һ Ё')).toBe('улытау оскемен гани нн уу х е');
  });
});

describe('Transfer', () => {
  function setup(v = view(), transfer = vi.fn().mockResolvedValue({ ok: true, value: { penalty: 0, freeLeft: 0, bank: 250 } })) {
    const onDone = vi.fn();
    wrap(<Transfer view={v} players={PLAYERS} clubs={CLUBS} api={{ transfer }} initialOut={null} onDone={onDone} />);
    return { transfer, onDone };
  }

  it('поиск «кайрат» находит игроков клуба «Қайрат»', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Шығару: DEF40' }));
    fireEvent.change(screen.getByLabelText('Ойыншы іздеу'), { target: { value: 'кайрат' } });
    // Защитники Қайрата, не входящие в состав
    expect(screen.getByText('DEF01')).toBeTruthy();
    expect(screen.queryByText('DEF51')).toBeNull();
  });

  it('клуб, из которого уже трое, заблокирован с подписью 3/3', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Шығару: DEF40' }));
    // Клуб 0 (ҚАЙ): в составе ВР, ЗАЩ, ПЗ — уже трое
    const row = screen.getByText('DEF01').closest('li')!;
    expect(within(row).getByText('3/3')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /Қосу/ })).toBeNull();
    // Клуб 5 свободен
    expect(screen.getByRole('button', { name: 'Қосу: DEF50' })).toBeTruthy();
  });

  it('штраф показан заранее: первый трансфер при 1 бесплатном — без штрафа, второй — «−4»', async () => {
    const { transfer, onDone } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Шығару: DEF40' }));
    fireEvent.click(screen.getByRole('button', { name: 'Қосу: DEF50' }));
    expect(confirmButton().textContent).toContain('шегерім жоқ');
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(transfer.mock.calls[0][0]).toMatchObject({ gameweek: 2, out: ['DEF-4-0'], in: ['DEF-5-0'], wildcard: false });

    fireEvent.click(screen.getByRole('button', { name: 'Шығару: FWD40' }));
    fireEvent.click(screen.getByRole('button', { name: 'Қосу: FWD50' }));
    expect(confirmButton().textContent).toContain('−4');
  });

  it('двойное нажатие «Растау» отправляет один запрос', async () => {
    let resolve: (v: unknown) => void = () => {};
    const transfer = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    setup(view(), transfer);
    fireEvent.click(screen.getByRole('button', { name: 'Шығару: DEF40' }));
    fireEvent.click(screen.getByRole('button', { name: 'Қосу: DEF50' }));
    fireEvent.click(confirmButton());
    fireEvent.click(confirmButton());
    expect(transfer).toHaveBeenCalledOnce();
    await act(async () => resolve({ ok: true, value: { penalty: 0, freeLeft: 0, bank: 250 } }));
  });

  it('после выбора уходящего экран возвращается к карточке «Шығады → Кіреді»', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Шығару: DEF40' }));
    expect(scroll).toHaveBeenCalled();
    expect(scroll.mock.contexts.at(-1)).toBe(screen.getByTestId('swap-card'));
  });

  it('после сбоя сети повторное «Растау» шлёт тот же requestId (сервер не спишет дважды)', async () => {
    const transfer = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'network' })
      .mockResolvedValueOnce({ ok: true, value: { penalty: 0, freeLeft: 0, bank: 250 } });
    const { onDone } = setup(view(), transfer);
    fireEvent.click(screen.getByRole('button', { name: 'Шығару: DEF40' }));
    fireEvent.click(screen.getByRole('button', { name: 'Қосу: DEF50' }));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(transfer).toHaveBeenCalledTimes(2);
    expect(transfer.mock.calls[1][0].requestId).toBe(transfer.mock.calls[0][0].requestId);
  });

  it('новое намерение — новый requestId', async () => {
    const transfer = vi.fn().mockResolvedValue({ ok: true, value: { penalty: 0, freeLeft: 0, bank: 250 } });
    setup(view({ freeTransfers: 2 }), transfer);
    fireEvent.click(screen.getByRole('button', { name: 'Шығару: DEF40' }));
    fireEvent.click(screen.getByRole('button', { name: 'Қосу: DEF50' }));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(transfer).toHaveBeenCalledOnce());
    fireEvent.click(await screen.findByRole('button', { name: 'Шығару: FWD40' }));
    fireEvent.click(screen.getByRole('button', { name: 'Қосу: FWD50' }));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(transfer).toHaveBeenCalledTimes(2));
    expect(transfer.mock.calls[1][0].requestId).not.toBe(transfer.mock.calls[0][0].requestId);
  });

  it('без crypto.randomUUID (старый WebView) запрос всё равно уходит с корректным id', async () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const { transfer } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Шығару: DEF40' }));
      fireEvent.click(screen.getByRole('button', { name: 'Қосу: DEF50' }));
      fireEvent.click(confirmButton());
      await waitFor(() => expect(transfer).toHaveBeenCalledOnce());
      expect(transfer.mock.calls[0][0].requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });

  it('not_owned (состав уже изменился) — перечитать данные', async () => {
    const { onDone } = setup(view(), vi.fn().mockResolvedValue({ ok: false, error: 'not_owned' }));
    fireEvent.click(screen.getByRole('button', { name: 'Шығару: DEF40' }));
    fireEvent.click(screen.getByRole('button', { name: 'Қосу: DEF50' }));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('Wildcard: «Жоқ» в подтверждении оставляет его выключенным', () => {
    setup(view({ freeTransfers: 0 }));
    fireEvent.click(screen.getByRole('button', { name: /Wildcard/ }));
    expect(screen.getByText(/бір рет қана/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Жоқ' }));
    expect(screen.queryByText(/бір рет қана/)).toBeNull();
    expect(screen.getByRole('button', { name: /Wildcard/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('нажатие на фамилию в списке открывает карточку игрока', () => {
    const onPlayer = vi.fn();
    wrap(<Transfer view={view()} players={PLAYERS} clubs={CLUBS} api={{ transfer: vi.fn() }} initialOut="DEF-4-0" onDone={() => {}} onPlayer={onPlayer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ойыншы картасы: DEF50' }));
    expect(onPlayer).toHaveBeenCalledWith('DEF-5-0');
  });

  it('ошибка сервера deadline_passed показывается текстом', async () => {
    setup(view(), vi.fn().mockResolvedValue({ ok: false, error: 'deadline_passed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Шығару: DEF40' }));
    fireEvent.click(screen.getByRole('button', { name: 'Қосу: DEF50' }));
    fireEvent.click(confirmButton());
    expect(await screen.findByText('Дедлайн өтті')).toBeTruthy();
  });

  it('дороже банка — нельзя добавить; Wildcard отправляется флагом и убирает штраф', () => {
    const expensive = { ...P('DEF', 5, 1), price: 400 };
    const players = PLAYERS.map((p) => (p.id === expensive.id ? expensive : p));
    const transfer = vi.fn().mockResolvedValue({ ok: true, value: { penalty: 0, freeLeft: 0, bank: 250 } });
    wrap(<Transfer view={view({ freeTransfers: 0 })} players={players} clubs={CLUBS} api={{ transfer }} initialOut="DEF-4-0" onDone={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Қосу: DEF51' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Қосу: DEF50' }));
    expect(confirmButton().textContent).toContain('−4');
    fireEvent.click(screen.getByRole('button', { name: /Wildcard/ }));
    // Wildcard бір рет қана беріледі — алдымен сұрайды
    expect(confirmButton().textContent).toContain('−4');
    fireEvent.click(screen.getByRole('button', { name: 'Иә, қосу' }));
    expect(confirmButton().textContent).toContain('шегерім жоқ');
    fireEvent.click(confirmButton());
    expect(transfer.mock.calls[0][0].wildcard).toBe(true);
  });
});

describe('Builder', () => {
  function setup() {
    const saveLineup = vi.fn().mockResolvedValue({ ok: true, value: { squadId: 's1' } });
    const onDone = vi.fn();
    const v: TeamView = { next: { id: 'g1', number: 1, deadline: '2026-03-07T09:00:00.000Z' }, last: null, squad: null, picks: [] };
    wrap(<Builder view={v} players={PLAYERS} clubs={CLUBS} api={{ saveLineup }} onDone={onDone} />);
    return { saveLineup, onDone };
  }
  const add = (p: PlayerRow) => fireEvent.click(screen.getByRole('button', { name: `Қосу: ${p.lastName}` }));
  const save = () => screen.getByRole('button', { name: 'Сақтау' }) as HTMLButtonElement;

  it('не даёт взять третьего вратаря и сохранить неполный состав', () => {
    setup();
    expect(screen.getByText('100.0')).toBeTruthy();
    add(P('GK', 0));
    add(P('GK', 1));
    expect(screen.queryByRole('button', { name: 'Қосу: GK2' + '0' })).toBeNull();
    expect(save().disabled).toBe(true);
  });

  it('валидный состав из 15 сохраняется: схема 4-4-2 в основе, капитан и вице назначены', async () => {
    const { saveLineup, onDone } = setup();
    for (const p of OWNED) add(p);
    expect(screen.getByText('25.0')).toBeTruthy();
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const { gameweek, picks } = saveLineup.mock.calls[0][0];
    expect(gameweek).toBe(1);
    expect(picks).toHaveLength(15);
    const pos = (slot: number) => PLAYERS.find((p) => p.id === picks.find((x: { slot: number }) => x.slot === slot).playerId)!.position;
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(pos)).toEqual(['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD']);
    expect([12, 13, 14, 15].map(pos)).toEqual(['GK', 'DEF', 'MID', 'FWD']);
    expect(picks.filter((p: { isCaptain: boolean }) => p.isCaptain)).toHaveLength(1);
    expect(picks.filter((p: { isVice: boolean }) => p.isVice)).toHaveLength(1);
  });

  it('ответ на первое сохранение потерялся, повтор получил squad_exists — состав уже есть, переходим к команде', async () => {
    const saveLineup = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_squad', details: ['squad_exists'] });
    const onDone = vi.fn();
    const v: TeamView = { next: { id: 'g1', number: 1, deadline: '2026-03-07T09:00:00.000Z' }, last: null, squad: null, picks: [] };
    wrap(<Builder view={v} players={PLAYERS} clubs={CLUBS} api={{ saveLineup }} onDone={onDone} />);
    for (const p of OWNED) add(p);
    fireEvent.click(save());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('нажатие на выбранного игрока на поле убирает его', () => {
    setup();
    add(P('FWD', 2));
    fireEvent.click(screen.getByRole('button', { name: /^FWD20,/ }));
    expect(screen.getByRole('button', { name: 'Қосу: FWD20' })).toBeTruthy();
  });
});
