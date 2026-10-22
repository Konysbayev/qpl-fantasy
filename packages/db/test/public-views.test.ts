import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from './helpers.js';
import { seedLeague, type League } from './league.js';

let sql: postgres.Sql;
let L: League;
beforeAll(async () => {
  sql = await freshDb('qpl_test_public_views');
  L = await seedLeague(sql);
});
afterAll(async () => {
  await sql?.end();
});

async function fixture(status: string, stats: { player: string; minutes: number; points: number; goals?: number; assists?: number; conceded?: number; yellow?: number }[]) {
  const [f] = await sql`insert into fixtures (season_id, gameweek_id, home_club_id, away_club_id, kickoff, status)
    values (${L.seasonId}, ${L.gws[0].id}, ${L.clubs[0]}, ${L.clubs[1]}, now(), ${status}) returning id`;
  for (const s of stats) {
    await sql`insert into player_match_stats (fixture_id, player_id, minutes, points, goals, assists, conceded, yellow)
      values (${f.id}, ${s.player}, ${s.minutes}, ${s.points}, ${s.goals ?? 0}, ${s.assists ?? 0}, ${s.conceded ?? 0}, ${s.yellow ?? 0})`;
  }
}

describe('player_season_stats', () => {
  it('итоги сезона по сыгранным матчам: очки, минуты, голы, ассисты, «сухие», карточки; доступно анониму', async () => {
    const gk = L.player('GK', 0);
    await fixture('finished', [{ player: gk, minutes: 90, points: 6, conceded: 0 }, { player: L.player('FWD', 1), minutes: 70, points: 9, goals: 1, assists: 1, yellow: 1 }]);
    await fixture('finished', [{ player: gk, minutes: 90, points: 1, conceded: 2 }, { player: L.player('FWD', 1), minutes: 30, points: 1 }]);
    await fixture('live', [{ player: gk, minutes: 45, points: 3 }]);

    const rows = await sql.begin(async (tx) => {
      await tx.unsafe('set local role anon');
      return tx`select * from player_season_stats`;
    });
    const by = new Map(rows.map((r) => [r.player_id, r]));
    expect(by.get(gk)).toMatchObject({ points: 7, minutes: 180, appearances: 2, clean_sheets: 1, goals: 0 });
    expect(by.get(L.player('FWD', 1))).toMatchObject({ points: 10, minutes: 100, goals: 1, assists: 1, yellow: 1, red: 0, clean_sheets: 0 });
  });
});
