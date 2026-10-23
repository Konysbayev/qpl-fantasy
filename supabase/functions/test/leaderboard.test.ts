import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signSession } from '../../../packages/auth/src/telegram.js';
import { freshDb } from '../../../packages/db/test/helpers.js';
import { newUser, seedLeague } from '../../../packages/db/test/league.js';
import { leaderboard } from '../leaderboard/handler.js';

const SECRET = 'fn-leaders-secret';
const NOW = 1_800_000_000;
let sql: postgres.Sql;
let token: string;

beforeAll(async () => {
  sql = await freshDb('qpl_test_fn_leaders');
  const L = await seedLeague(sql);
  const user = await newUser(sql);
  await sql`insert into gameweek_scores (user_id, gameweek_id, points, penalty, season_total, rank) values (${user}, ${L.gws[0].id}, 12, 0, 12, 1)`;
  token = await signSession({ sub: user, tg: 1 }, SECRET, NOW);
});
afterAll(async () => {
  await sql?.end();
});

const req = (query = '', auth: string | null = token) =>
  new Request(`https://x/functions/v1/leaderboard${query}`, { headers: auth ? { authorization: `Bearer ${auth}` } : {} });
const deps = () => ({ sql, sessionSecret: SECRET, nowSec: NOW });

describe('leaderboard', () => {
  it('без сессии → 401', async () => {
    expect((await leaderboard(req('', null), deps())).status).toBe(401);
  });

  it('отдаёт рейтинг; страница задаётся offset/limit', async () => {
    const res = await leaderboard(req('?offset=0&limit=10'), deps());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ gameweek: 1, total: 1, rows: [{ rank: 1, gwPoints: 12, total: 12, me: true }] });
  });

  it('неверные offset/limit → 400', async () => {
    expect((await leaderboard(req('?limit=500'), deps())).status).toBe(400);
    expect((await leaderboard(req('?offset=-1'), deps())).status).toBe(400);
    expect((await leaderboard(req('?limit=abc'), deps())).status).toBe(400);
  });
});
