import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { applyPriceChanges } from '../src/prices.js';
import { freshDb } from './helpers.js';
import { newUser, seedLeague, type League } from './league.js';

let sql: postgres.Sql;
let L: League;
let users: string[];
let filler: string[];
const now = new Date('2026-03-20T12:00:00Z');

beforeAll(async () => {
  sql = await freshDb('qpl_test_prices');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  L = await seedLeague(sql);
  await sql`truncate price_changes`;
  users = [];
  for (let i = 0; i < 20; i++) {
    const u = await newUser(sql);
    await sql`insert into squads (user_id, gameweek_id, bank, free_transfers) values (${u}, ${L.gws[0].id}, 0, 1)`;
    users.push(u);
  }
  filler = [0, 1, 2, 3, 4, 5].flatMap((c) => [L.player('DEF', c, 1), L.player('MID', c, 1)]);
});

let next = 0;
async function move(playerIn: string | null, playerOut: string | null, times: number, at = new Date(now.getTime() - 3_600_000)) {
  for (let i = 0; i < times; i++) {
    const out = playerOut ?? filler[next++ % filler.length];
    const inn = playerIn ?? filler[next++ % filler.length];
    await sql`insert into transfers (user_id, gameweek_id, player_out, player_in, price_out, price_in, created_at)
      values (${users[i]}, ${L.gws[1].id}, ${out}, ${inn}, 50, 50, ${at})`;
  }
}
const price = async (id: string) => (await sql`select price from players where id = ${id}`)[0].price as number;

describe('applyPriceChanges', () => {
  it('пороги 5/10/20% → +0.1/+0.2/+0.3, продажи вниз; границы 3.5 и 12.0; повтор для того же тура — null', async () => {
    const [p1, p2, p3, p4, p5, p6] = [L.player('GK', 0), L.player('GK', 1), L.player('GK', 2), L.player('GK', 3), L.player('GK', 4), L.player('GK', 5)];
    await sql`update players set price = 119 where id = ${p5}`;
    await sql`update players set price = 36 where id = ${p6}`;
    await move(p1, null, 1);
    await move(p2, null, 2);
    await move(p3, null, 4);
    await move(null, p4, 2);
    await move(p5, null, 4);
    await move(null, p6, 2);
    const r = await applyPriceChanges(sql, L.seasonId, L.gws[0].id, now);
    expect(r?.changed).toBeGreaterThanOrEqual(6);
    expect([await price(p1), await price(p2), await price(p3), await price(p4), await price(p5), await price(p6)]).toEqual([51, 52, 53, 48, 120, 35]);
    expect(await applyPriceChanges(sql, L.seasonId, L.gws[0].id, now)).toBeNull();
    expect(await price(p1)).toBe(51);
  });

  it('трансферы до прошлого изменения цен не учитываются', async () => {
    const p = L.player('FWD', 0);
    const before = new Date(now.getTime() - 86_400_000);
    await move(p, null, 4, new Date(before.getTime() - 60_000));
    await sql`insert into price_changes (gameweek_id, applied_at, changed) values (${L.gws[0].id}, ${before}, 0)`;
    await applyPriceChanges(sql, L.seasonId, L.gws[1].id, now);
    expect(await price(p)).toBe(50);
  });

  it('пороги берутся из настроек сезона', async () => {
    const p = L.player('FWD', 1);
    await sql`update seasons set price_steps = '[[0.5,1]]' where id = ${L.seasonId}`;
    await move(p, null, 2);
    await applyPriceChanges(sql, L.seasonId, L.gws[0].id, now);
    expect(await price(p)).toBe(50);
  });
});
