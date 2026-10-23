import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { advanceGameweeks, gameweekPhase, scoreGameweek } from '../src/finalize.js';
import { createFirstSquad } from '../src/squad.js';
import { freshDb } from './helpers.js';
import { START, newUser, seedLeague, standardPicks, type League } from './league.js';

const H = 3_600_000;
let sql: postgres.Sql;
let L: League;

beforeAll(async () => {
  sql = await freshDb('qpl_test_finalize');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  L = await seedLeague(sql);
  await sql`truncate gameweek_scores, audit_log`;
});

const kickoff = () => new Date(START.getTime() + H);

async function fixture(gw: number, status: string, at = kickoff()): Promise<string> {
  const [f] = await sql`insert into fixtures (season_id, gameweek_id, home_club_id, away_club_id, kickoff, status)
    values (${L.seasonId}, ${L.gws[gw - 1].id}, ${L.clubs[0]}, ${L.clubs[1]}, ${at}, ${status}) returning id`;
  return f.id;
}
// Құрамдағы 15 ойыншының бәріне 2 ұпай, ШАБ 2-ге — 6 ұпай; есепке тек негізгі 11 кіреді: 10 × 2 + 6 = 26 және капитан
async function stats(fixtureId: string) {
  for (const p of standardPicks(L)) {
    const pts = p.playerId === L.player('FWD', 2) ? 6 : 2;
    await sql`insert into player_match_stats (fixture_id, player_id, minutes, points) values (${fixtureId}, ${p.playerId}, 90, ${pts})`;
  }
}
async function squad(picks = standardPicks(L)): Promise<string> {
  const user = await newUser(sql);
  const r = await createFirstSquad(sql, user, new Date(START.getTime() - H), picks, 1);
  if (!r.ok) throw new Error(r.error);
  return user;
}
const score = async (user: string, gw = 1) =>
  (await sql`select points, penalty, season_total, rank from gameweek_scores where user_id = ${user} and gameweek_id = ${L.gws[gw - 1].id}`)[0];

describe('gameweekPhase', () => {
  const k = kickoff();
  const g = (status: string) => ({ deadline: START, fixtures: [{ kickoff: k, status }] });
  it('open → live → played → closed; зависший матч закрывается через 48 часов', () => {
    expect(gameweekPhase(g('upcoming'), new Date(START.getTime() - 1))).toBe('open');
    expect(gameweekPhase(g('live'), new Date(k.getTime() + H))).toBe('live');
    expect(gameweekPhase(g('finished'), new Date(k.getTime() + 25 * H))).toBe('played');
    expect(gameweekPhase(g('finished'), new Date(k.getTime() + 26 * H))).toBe('closed');
    expect(gameweekPhase(g('live'), new Date(k.getTime() + 49 * H))).toBe('closed');
  });
});

describe('scoreGameweek', () => {
  it('штраф отдельно от очков; при равенстве выше тот, у кого меньше платных трансферов', async () => {
    const b = await squad();
    const a = await squad(standardPicks(L).map((p) => ({ ...p, isCaptain: p.playerId === L.player('FWD', 2), isVice: p.playerId === L.player('MID', 0) })));
    await sql`insert into transfers (user_id, gameweek_id, player_out, player_in, price_out, price_in, penalty)
      values (${a}, ${L.gws[0].id}, ${L.player('MID', 4)}, ${L.player('MID', 5)}, 50, 50, -4)`;
    await stats(await fixture(1, 'finished'));
    expect(await scoreGameweek(sql, L.gws[0].id)).toEqual({ scored: 2 });
    expect(await score(b)).toMatchObject({ points: 28, penalty: 0, season_total: 28, rank: 1 });
    expect(await score(a)).toMatchObject({ points: 32, penalty: -4, season_total: 28, rank: 2 });
  });

  it('пропавший пользователь: состав копируется на следующий тур; без состава — строки нет', async () => {
    const c = await squad();
    const d = await newUser(sql);
    await scoreGameweek(sql, L.gws[1].id);
    expect(await score(c, 2)).toMatchObject({ points: 0, rank: 1 });
    expect(await sql`select 1 from gameweek_scores where user_id = ${d}`).toHaveLength(0);
    expect(await sql`select 1 from squads s where s.user_id = ${c} and s.gameweek_id = ${L.gws[1].id}`).toHaveLength(1);
  });

  it('повторный пересчёт даёт то же; правка статистики меняет очки; сумма за сезон копится', async () => {
    const b = await squad();
    const f = await fixture(1, 'finished');
    await stats(f);
    await scoreGameweek(sql, L.gws[0].id);
    await scoreGameweek(sql, L.gws[0].id);
    expect(await score(b)).toMatchObject({ points: 28 });
    await sql`update player_match_stats set points = 12 where fixture_id = ${f} and player_id = ${L.player('MID', 0)}`;
    await scoreGameweek(sql, L.gws[0].id);
    expect(await score(b)).toMatchObject({ points: 48 });
    await stats(await fixture(2, 'finished', new Date(L.gws[1].deadline.getTime() + H)));
    await scoreGameweek(sql, L.gws[1].id);
    expect(await score(b, 2)).toMatchObject({ points: 28, season_total: 76 });
  });
});

describe('advanceGameweeks', () => {
  it('upcoming → live → played → closed, повтор без изменений — пусто', async () => {
    await squad();
    const f = await fixture(1, 'live');
    const k = kickoff();
    expect(await advanceGameweeks(sql, L.seasonId, new Date(k.getTime() + H))).toEqual([{ gameweekId: L.gws[0].id, number: 1, from: 'upcoming', to: 'live' }]);
    await sql`update fixtures set status = 'finished' where id = ${f}`;
    expect((await advanceGameweeks(sql, L.seasonId, new Date(k.getTime() + 3 * H))).map((t) => t.to)).toEqual(['played']);
    expect(await sql`select 1 from gameweek_scores`).toHaveLength(1);
    expect((await advanceGameweeks(sql, L.seasonId, new Date(k.getTime() + 27 * H))).map((t) => [t.from, t.to])).toEqual([['played', 'closed']]);
    expect(await advanceGameweeks(sql, L.seasonId, new Date(k.getTime() + 28 * H))).toEqual([]);
  });

  it('зависший матч: тур закрывается через 48 часов, матч записывается в журнал', async () => {
    const f = await fixture(1, 'live');
    const t = await advanceGameweeks(sql, L.seasonId, new Date(kickoff().getTime() + 49 * H));
    expect(t.map((x) => x.to)).toEqual(['closed']);
    const [log] = await sql`select payload from audit_log where action = 'fixture_stuck'`;
    expect(log.payload).toEqual({ gameweek: 1, fixtureIds: [f] });
  });

  it('прошедший дедлайн закрепляется: перенос матчей его больше не сдвигает', async () => {
    await advanceGameweeks(sql, L.seasonId, new Date(START.getTime() + H));
    const rows = await sql`select number, deadline_locked from gameweeks order by number`;
    expect(rows.map((r) => [r.number, r.deadline_locked])).toEqual([[1, true], [2, false], [3, false]]);
  });

  it('ошибка подсчёта одного тура не останавливает остальные и попадает в журнал', async () => {
    await squad();
    const now = new Date(L.gws[1].deadline.getTime() + 30 * H);
    const failing = async (_sql: postgres.Sql, id: string) => {
      if (id === L.gws[0].id) throw new Error('pooler timeout');
      return { scored: 0 };
    };
    const t = await advanceGameweeks(sql, L.seasonId, now, failing);
    expect(t.map((x) => x.number)).toEqual([2]);
    const [log] = await sql`select payload from audit_log where action = 'cron_error'`;
    expect(log.payload).toEqual({ step: 'gameweek 1', error: 'pooler timeout' });
  });
});

