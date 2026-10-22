import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { commitTransfers, createFirstSquad, currentGameweek, ensureSquad, saveLineup } from '../src/squad.js';
import { freshDb } from './helpers.js';
import { newUser, seedLeague, standardPicks, type League, type PickInput } from './league.js';

let sql: postgres.Sql;
let L: League;
beforeAll(async () => {
  sql = await freshDb('qpl_test_squad');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  L = await seedLeague(sql);
});

const SEC = 1000;
const HOUR = 3_600_000;
const deadline = (n: number) => L.gws[n - 1].deadline.getTime();
const at = (ms: number) => new Date(ms);

async function squadOf(userId: string, gw: number) {
  const [s] = await sql<{ id: string; bank: number; free_transfers: number; chip: string | null }[]>`select s.id, s.bank, s.free_transfers, s.chip from squads s join gameweeks g on g.id = s.gameweek_id
    where s.user_id = ${userId} and g.number = ${gw}`;
  if (!s) return null;
  const picks = await sql<{ player_id: string; slot: number; is_captain: boolean; is_vice: boolean }[]>`
    select player_id, slot, is_captain, is_vice from squad_picks where squad_id = ${s.id} order by slot`;
  return { ...s, picks };
}

// Бірінші турдың дедлайнына дейін алғашқы құрам
async function userWithSquad(): Promise<string> {
  const user = await newUser(sql);
  const r = await createFirstSquad(sql, user, at(deadline(1) - HOUR), standardPicks(L), 1);
  expect(r.ok).toBe(true);
  return user;
}

const transfer = (out: string[], inn: string[], gameweek: number, extra: { wildcard?: boolean; requestId?: string } = {}) => ({
  requestId: extra.requestId ?? randomUUID(), gameweek, out, in: inn, wildcard: extra.wildcard ?? false
});

describe('currentGameweek', () => {
  it('первый тур с дедлайном позже текущего момента', async () => {
    expect((await currentGameweek(sql, L.seasonId, at(deadline(1) - SEC)))?.number).toBe(1);
    expect((await currentGameweek(sql, L.seasonId, at(deadline(1))))?.number).toBe(2);
    expect(await currentGameweek(sql, L.seasonId, at(deadline(3) + SEC))).toBeNull();
  });
});

describe('createFirstSquad', () => {
  it('первый состав сохраняется: банк 25.0, бесплатных 0 (тур без ограничений), капитан и вице', async () => {
    const user = await newUser(sql);
    const r = await createFirstSquad(sql, user, at(deadline(1) - HOUR), standardPicks(L), 1);
    expect(r.ok).toBe(true);
    const s = await squadOf(user, 1);
    expect(s).toMatchObject({ bank: 250, free_transfers: 0, chip: null });
    expect(s!.picks).toHaveLength(15);
    expect(s!.picks.find((p) => p.is_captain)?.player_id).toBe(L.player('MID', 0));
    expect(s!.picks.find((p) => p.is_vice)?.player_id).toBe(L.player('FWD', 2));
  });

  it('4 из одного клуба → invalid_squad с club_limit', async () => {
    const picks = standardPicks(L).map((p) => (p.playerId === L.player('MID', 1) ? { ...p, playerId: L.player('MID', 0, 1) } : p));
    const r = await createFirstSquad(sql, await newUser(sql), at(deadline(1) - HOUR), picks, 1);
    expect(r).toMatchObject({ ok: false, error: 'invalid_squad' });
    expect(r.ok === false && r.details).toContain('club_limit');
  });

  it('дороже 100.0 млн → invalid_squad с budget', async () => {
    await sql`update players set price = 100 where id = ${L.player('FWD', 2)}`;
    await sql`update players set price = 95 where position = 'MID'`;
    const r = await createFirstSquad(sql, await newUser(sql), at(deadline(1) - HOUR), standardPicks(L), 1);
    expect(r.ok === false && r.details).toContain('budget');
  });

  it('капитан в запасе → invalid_lineup', async () => {
    const picks = standardPicks(L).map((p) => ({ ...p, isCaptain: p.slot === 13 }));
    const r = await createFirstSquad(sql, await newUser(sql), at(deadline(1) - HOUR), picks, 1);
    expect(r).toMatchObject({ ok: false, error: 'invalid_lineup' });
  });

  it('тур на экране уже закрыт → deadline_passed; туров не осталось → no_open_gameweek', async () => {
    const user = await newUser(sql);
    expect(await createFirstSquad(sql, user, at(deadline(1) + SEC), standardPicks(L), 1)).toMatchObject({ ok: false, error: 'deadline_passed' });
    expect(await createFirstSquad(sql, user, at(deadline(3) + SEC), standardPicks(L), 3)).toMatchObject({ ok: false, error: 'no_open_gameweek' });
    expect(await squadOf(user, 2)).toBeNull();
  });
});

describe('commitTransfers', () => {
  it('до дедлайна первого тура пользователя трансферы без ограничений и без штрафа', async () => {
    const user = await userWithSquad();
    const r = await commitTransfers(sql, user, at(deadline(1) - HOUR), transfer(
      [L.player('DEF', 4), L.player('MID', 4), L.player('FWD', 4)], [L.player('DEF', 5), L.player('MID', 5), L.player('FWD', 5)], 1));
    expect(r).toEqual({ ok: true, value: { penalty: 0, freeLeft: 0, bank: 250 } });
  });

  it('за секунду до дедлайна трансфер проходит, через секунду после — deadline_passed, состав не меняется', async () => {
    const user = await userWithSquad();
    const ok = await commitTransfers(sql, user, at(deadline(2) - SEC), transfer([L.player('DEF', 4)], [L.player('DEF', 5)], 2));
    expect(ok).toEqual({ ok: true, value: { penalty: 0, freeLeft: 0, bank: 250 } });

    const before = await squadOf(user, 2);
    const late = await commitTransfers(sql, user, at(deadline(2) + SEC), transfer([L.player('FWD', 4)], [L.player('FWD', 5)], 2));
    expect(late).toEqual({ ok: false, error: 'deadline_passed' });
    expect(await squadOf(user, 2)).toEqual(before);
    expect((await sql`select count(*)::int as n from transfers where player_in = ${L.player('FWD', 5)}`)[0].n).toBe(0);
  });

  it('2 трансфера при 1 бесплатном → штраф −4', async () => {
    const user = await userWithSquad();
    const r = await commitTransfers(sql, user, at(deadline(2) - HOUR), transfer([L.player('DEF', 4), L.player('FWD', 4)], [L.player('DEF', 5), L.player('FWD', 5)], 2));
    expect(r).toEqual({ ok: true, value: { penalty: -4, freeLeft: 0, bank: 250 } });
    const rows = await sql`select penalty from transfers where user_id = ${user}`;
    expect(rows.reduce((s, t) => s + t.penalty, 0)).toBe(-4);
  });

  it('повтор того же requestId → тот же результат, второго списания и штрафа нет', async () => {
    const user = await userWithSquad();
    const req = transfer([L.player('DEF', 4), L.player('FWD', 4)], [L.player('DEF', 5), L.player('FWD', 5)], 2);
    const now = at(deadline(2) - HOUR);
    const [a, b] = await Promise.all([commitTransfers(sql, user, now, req), commitTransfers(sql, user, now, req)]);
    const c = await commitTransfers(sql, user, now, req);
    expect(a).toEqual({ ok: true, value: { penalty: -4, freeLeft: 0, bank: 250 } });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect((await sql`select count(*)::int as n, sum(penalty)::int as p from transfers where user_id = ${user}`)[0]).toEqual({ n: 2, p: -4 });
  });

  it('продажа по текущей цене; не хватает банка → invalid_squad с budget', async () => {
    const user = await userWithSquad();
    await sql`update players set price = 70 where id = ${L.player('DEF', 4)}`;
    const sold = await commitTransfers(sql, user, at(deadline(2) - HOUR), transfer([L.player('DEF', 4)], [L.player('DEF', 5)], 2));
    expect(sold).toEqual({ ok: true, value: { penalty: 0, freeLeft: 0, bank: 270 } });

    await sql`update players set price = 400 where id = ${L.player('FWD', 5)}`;
    const r = await commitTransfers(sql, user, at(deadline(2) - HOUR), transfer([L.player('FWD', 4)], [L.player('FWD', 5)], 2));
    expect(r.ok === false && r.error).toBe('invalid_squad');
    expect(r.ok === false && r.details).toContain('budget');
  });

  it('четвёртый из клуба → club_limit; чужой игрок в «уходит» → not_owned; другая позиция → invalid_squad', async () => {
    const user = await userWithSquad();
    const now = at(deadline(2) - HOUR);
    const club = await commitTransfers(sql, user, now, transfer([L.player('DEF', 4)], [L.player('DEF', 0, 1)], 2));
    expect(club.ok === false && club.details).toContain('club_limit');
    expect(await commitTransfers(sql, user, now, transfer([L.player('DEF', 5)], [L.player('DEF', 5, 1)], 2))).toMatchObject({ ok: false, error: 'not_owned' });
    expect(await commitTransfers(sql, user, now, transfer([L.player('DEF', 4)], [L.player('MID', 5)], 2))).toMatchObject({ ok: false, error: 'invalid_squad' });
  });

  it('Wildcard: трансферы без штрафа; второй раз в турах 1–15 → wildcard_unavailable', async () => {
    const user = await userWithSquad();
    const wc = await commitTransfers(sql, user, at(deadline(2) - HOUR), transfer(
      [L.player('DEF', 4), L.player('MID', 4), L.player('FWD', 4)], [L.player('DEF', 5), L.player('MID', 5), L.player('FWD', 5)], 2, { wildcard: true }));
    expect(wc).toEqual({ ok: true, value: { penalty: 0, freeLeft: 1, bank: 250 } });
    expect((await squadOf(user, 2))!.chip).toBe('wildcard');

    const again = await commitTransfers(sql, user, at(deadline(3) - HOUR), transfer([L.player('DEF', 5)], [L.player('DEF', 4)], 3, { wildcard: true }));
    expect(again).toEqual({ ok: false, error: 'wildcard_unavailable' });
  });
});

describe('ensureSquad', () => {
  it('следующий тур без нового состава: тот же состав и банк, +1 бесплатный', async () => {
    const user = await userWithSquad();
    const id = await ensureSquad(sql, user, L.gws[1].id);
    expect(id).not.toBeNull();
    const s1 = await squadOf(user, 1);
    const s2 = await squadOf(user, 2);
    expect(s2).toMatchObject({ id, bank: 250, free_transfers: 1, chip: null });
    expect(s2!.picks).toEqual(s1!.picks);
    expect(await ensureSquad(sql, user, L.gws[1].id)).toBe(id);
  });

  it('пропущенные туры заполняются, бесплатных +1 за каждый, но не больше 5', async () => {
    const user = await userWithSquad();
    await sql`update squads set free_transfers = 4 where user_id = ${user}`;
    await ensureSquad(sql, user, L.gws[2].id);
    expect((await squadOf(user, 2))!.free_transfers).toBe(5);
    expect((await squadOf(user, 3))!.free_transfers).toBe(5);
  });

  it('у пользователя нет состава → null', async () => {
    expect(await ensureSquad(sql, await newUser(sql), L.gws[1].id)).toBeNull();
  });
});

describe('saveLineup', () => {
  const swap = (picks: PickInput[], a: number, b: number) =>
    picks.map((p) => (p.slot === a ? { ...p, slot: b } : p.slot === b ? { ...p, slot: a } : p));

  it('новый капитан сохраняется, прежний становится обычным игроком', async () => {
    const user = await userWithSquad();
    const picks = standardPicks(L).map((p) => ({ ...p, isCaptain: p.slot === 2 }));
    expect(await saveLineup(sql, user, at(deadline(2) - HOUR), picks, 2)).toEqual({ ok: true, value: null });
    const s = await squadOf(user, 2);
    expect(s!.picks.filter((p) => p.is_captain).map((p) => p.player_id)).toEqual([L.player('DEF', 0)]);
    expect((await squadOf(user, 1))!.picks.find((p) => p.is_captain)?.player_id).toBe(L.player('MID', 0));
  });

  it('схема с 2 защитниками в основе → invalid_lineup, состав не меняется', async () => {
    const user = await userWithSquad();
    const picks = swap(swap(standardPicks(L), 4, 14), 5, 15);
    const r = await saveLineup(sql, user, at(deadline(1) - HOUR), picks, 1);
    expect(r).toMatchObject({ ok: false, error: 'invalid_lineup' });
    expect((await squadOf(user, 1))!.picks.find((p) => p.slot === 4)?.player_id).toBe(L.player('DEF', 2));
  });

  it('игрок не из состава → not_owned', async () => {
    const user = await userWithSquad();
    const picks = standardPicks(L).map((p) => (p.slot === 13 ? { ...p, playerId: L.player('DEF', 5) } : p));
    expect(await saveLineup(sql, user, at(deadline(1) - HOUR), picks, 1)).toMatchObject({ ok: false, error: 'not_owned' });
  });
});
