import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { commitTransfers, createFirstSquad } from '../src/squad.js';
import { loadTeamView } from '../src/team-view.js';
import { freshDb } from './helpers.js';
import { newUser, seedLeague, standardPicks, type League } from './league.js';

let sql: postgres.Sql;
let L: League;
beforeAll(async () => {
  sql = await freshDb('qpl_test_team_view');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  L = await seedLeague(sql);
});

const HOUR = 3_600_000;
const deadline = (n: number) => L.gws[n - 1].deadline.getTime();

async function fixture(gw: number, home: number, away: number, status: string, stats: [string, number, number][]): Promise<void> {
  const [f] = await sql`insert into fixtures (season_id, gameweek_id, home_club_id, away_club_id, kickoff, status)
    values (${L.seasonId}, ${L.gws[gw - 1].id}, ${L.clubs[home]}, ${L.clubs[away]}, ${new Date(deadline(gw) + 2 * HOUR)}, ${status}) returning id`;
  for (const [playerId, minutes, points] of stats) {
    await sql`insert into player_match_stats (fixture_id, player_id, minutes, points) values (${f.id}, ${playerId}, ${minutes}, ${points})`;
  }
}

describe('loadTeamView', () => {
  it('нет состава: открытый тур с дедлайном, пустой состав', async () => {
    const v = await loadTeamView(sql, await newUser(sql), new Date(deadline(1) - HOUR));
    expect(v.next).toEqual({ id: L.gws[0].id, number: 1, deadline: L.gws[0].deadline.toISOString() });
    expect(v.squad).toBeNull();
    expect(v.picks).toEqual([]);
    expect(v.last).toBeNull();
  });

  it('очки прошедшего тура с капитаном ×2 и автозаменой; состав открытого тура с очками игроков', async () => {
    const user = await newUser(sql);
    await createFirstSquad(sql, user, new Date(deadline(1) - HOUR), standardPicks(L), 1);
    // Клубы 0 и 1 сыграли: капитан (ЖҚ 0) 5 очков, ҚҚ 0 — 2, ҚОР 1 — 6, ЖҚ 1 — 3; ҚОР 0 не вышел
    await fixture(1, 0, 1, 'finished', [
      [L.player('GK', 0), 90, 2], [L.player('MID', 0), 90, 5], [L.player('DEF', 1), 90, 6], [L.player('MID', 1), 90, 3],
      [L.player('DEF', 0), 0, 0], [L.player('GK', 1), 90, 2]
    ]);
    // Клубы 2 и 3 сыграли без очков у наших; клуб 4 (запас) сыграл: ҚОР 4 вышел — заменит не вышедшего ҚОР 0
    await fixture(1, 2, 3, 'finished', [[L.player('FWD', 2), 90, 1], [L.player('FWD', 3), 90, 1], [L.player('DEF', 2), 90, 1], [L.player('DEF', 3), 90, 1],
      [L.player('MID', 2), 90, 1], [L.player('MID', 3), 90, 1]]);
    await fixture(1, 4, 5, 'finished', [[L.player('DEF', 4), 90, 4], [L.player('MID', 4), 90, 9]]);

    const now = new Date(deadline(1) + 3 * 24 * HOUR);
    await commitTransfers(sql, user, now, { requestId: crypto.randomUUID(), gameweek: 2, out: [L.player('FWD', 4)], in: [L.player('FWD', 5)], wildcard: false });
    const v = await loadTeamView(sql, user, now);

    // 2 + 5×2 + 6 + 3 + (1 × 6 игроков клубов 2–3) + 4 (ҚОР 4 вместо ҚОР 0) = 31
    expect(v.last).toMatchObject({ number: 1, status: 'finished', points: 31, penalty: 0, captainId: L.player('MID', 0), subsIn: [L.player('DEF', 4)] });
    expect(v.next?.number).toBe(2);
    expect(v.squad).toMatchObject({ gameweek: 2, bank: 250, freeTransfers: 0, unlimited: false, wildcardActive: false, wildcardAvailable: true, penalty: 0 });
    expect(v.picks).toHaveLength(15);
    expect(v.picks.map((p) => p.slot)).toEqual([...Array(15).keys()].map((i) => i + 1));
    const captain = v.picks.find((p) => p.isCaptain)!;
    expect(captain).toMatchObject({ playerId: L.player('MID', 0), position: 'MID', clubId: L.clubs[0], price: 50, points: 5, lastName: 'MID00' });
    expect(v.picks.find((p) => p.slot === 15)).toMatchObject({ playerId: L.player('FWD', 5), points: 0 });
  });

  it('тур ещё идёт: игроки, чей клуб не доиграл, не заменяются, статус live', async () => {
    const user = await newUser(sql);
    await createFirstSquad(sql, user, new Date(deadline(1) - HOUR), standardPicks(L), 1);
    await fixture(1, 0, 1, 'finished', [[L.player('MID', 0), 90, 5], [L.player('GK', 0), 90, 2]]);
    await fixture(1, 2, 3, 'live', []);
    await fixture(1, 4, 5, 'finished', [[L.player('DEF', 4), 90, 4]]);
    const v = await loadTeamView(sql, user, new Date(deadline(1) + 2 * HOUR));
    expect(v.last?.status).toBe('live');
    // Клубы 0 и 1 доиграли: ҚОР 0, ҚОР 1, ЖҚ 1 не вышли — первым по порядку заменяет ҚОР 4
    expect(v.last?.subsIn).toEqual([L.player('DEF', 4)]);
    expect(v.last?.points).toBe(2 + 10 + 4);
  });
});

describe('player_selection', () => {
  const selection = () =>
    sql.begin(async (tx) => {
      await tx.unsafe('set local role anon');
      return tx<{ player_id: string; selected_pct: number }[]>`select player_id, selected_pct from player_selection`;
    });

  it('% выбора считается только по составам после дедлайна: чужой состав до дедлайна не виден; доступно анониму', async () => {
    // Туры в будущем относительно часов базы: представление считает по now()
    await sql`update gameweeks set deadline = now() + (number || ' days')::interval`;
    const now = new Date();
    const a = await newUser(sql);
    const b = await newUser(sql);
    await createFirstSquad(sql, a, now, standardPicks(L), 1);
    const picksB = standardPicks(L).map((p) => (p.playerId === L.player('FWD', 4) ? { ...p, playerId: L.player('FWD', 5) } : p));
    await createFirstSquad(sql, b, now, picksB, 1);
    expect(await selection()).toEqual([]);

    // Дедлайн 1-го тура прошёл — составы заморожены и попадают в проценты
    await sql`update gameweeks set deadline = now() - interval '1 hour' where number = 1`;
    const pct = new Map((await selection()).map((r) => [r.player_id, r.selected_pct]));
    expect(pct.get(L.player('GK', 0))).toBe(100);
    expect(pct.get(L.player('FWD', 4))).toBe(50);
    expect(pct.get(L.player('FWD', 5))).toBe(50);
    expect(pct.has(L.player('DEF', 5))).toBe(false);
  });

  it('составы неактивного сезона не учитываются', async () => {
    await sql`update gameweeks set deadline = now() - interval '1 hour' where number = 1`;
    await sql`update gameweeks set deadline = now() + (number || ' days')::interval where number > 1`;
    const a = await newUser(sql);
    await sql`update gameweeks set deadline = now() + interval '1 hour' where number = 1`;
    await createFirstSquad(sql, a, new Date(), standardPicks(L), 1);
    await sql`update gameweeks set deadline = now() - interval '1 hour' where number = 1`;
    await sql`update seasons set status = 'finished'`;
    expect(await selection()).toEqual([]);
  });
});
