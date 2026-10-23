import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { loadLeaderboard } from '../src/leaderboard.js';
import { freshDb } from './helpers.js';
import { newUser, seedLeague, type League } from './league.js';

let sql: postgres.Sql;
let L: League;

beforeAll(async () => {
  sql = await freshDb('qpl_test_leaderboard');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  L = await seedLeague(sql);
});

async function scored(gw: number, rows: [string, number, number, number, number][]) {
  for (const [user, points, penalty, total, rank] of rows) {
    await sql`insert into gameweek_scores (user_id, gameweek_id, points, penalty, season_total, rank)
      values (${user}, ${L.gws[gw - 1].id}, ${points}, ${penalty}, ${total}, ${rank})`;
  }
}

describe('loadLeaderboard', () => {
  it('до первого посчитанного тура — пусто', async () => {
    const me = await newUser(sql);
    expect(await loadLeaderboard(sql, me, { offset: 0, limit: 50 })).toEqual({ gameweek: null, status: null, total: 0, rows: [], me: null });
  });

  it('берётся последний посчитанный тур; очки тура со штрафом; своя строка отмечена; имя команды или null', async () => {
    const [a, b, c] = [await newUser(sql), await newUser(sql), await newUser(sql)];
    await sql`update users set team_name = 'Алматы Барс' where id = ${a}`;
    await sql`update users set team_name = 'Тобыл Фан' where id = ${b}`;
    await scored(1, [[a, 50, 0, 50, 1], [b, 40, 0, 40, 2], [c, 30, 0, 30, 3]]);
    await scored(2, [[a, 10, 0, 60, 2], [b, 30, -4, 66, 1], [c, 20, 0, 50, 3]]);
    await sql`update gameweeks set status = 'played' where id = ${L.gws[1].id}`;
    const r = await loadLeaderboard(sql, c, { offset: 0, limit: 2 });
    expect(r).toMatchObject({ gameweek: 2, status: 'played', total: 3 });
    expect(r.rows).toEqual([
      { rank: 1, teamName: 'Тобыл Фан', gwPoints: 26, total: 66, me: false },
      { rank: 2, teamName: 'Алматы Барс', gwPoints: 10, total: 60, me: false }
    ]);
    expect(r.me).toEqual({ rank: 3, teamName: null, gwPoints: 20, total: 50, me: true });
    expect((await loadLeaderboard(sql, c, { offset: 2, limit: 2 })).rows).toEqual([{ rank: 3, teamName: null, gwPoints: 20, total: 50, me: true }]);
  });
});
