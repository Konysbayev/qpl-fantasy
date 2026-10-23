import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../../packages/core/src/rules.js';
import { parseMatchPage } from '../../../packages/kffleague/src/match.js';
import { upsertMatch } from '../../../packages/db/src/sync.js';
import { freshDb } from '../../../packages/db/test/helpers.js';
import { matchPage } from '../../../packages/db/test/source.js';
import { buildOverrideSql, findRowsSql, parseSet, rowToStat, type DbStatRow } from '../override-stat.js';

let sql: postgres.Sql;
let seasonId: string;

beforeAll(async () => {
  sql = await freshDb('qpl_test_override');
  const [s] = await sql`insert into seasons (year, source_season_id, scoring_rules, status) values (2026, 200, ${sql.json(DEFAULT_RULES as never)}, 'active') returning id`;
  seasonId = s.id;
  const html = matchPage(993);
  await upsertMatch(sql, seasonId, parseMatchPage(html, 993), html);
});
afterAll(async () => {
  await sql?.end();
});

describe('override-stat', () => {
  it('гол защитнику: +6 очков, manual_override, журнал до/после, закрытый тур снова «сыгран»; загрузчик правку не затирает', async () => {
    const [def] = await sql`select p.last_name from player_match_stats s join players p on p.id = s.player_id
      where p.position = 'DEF' and s.minutes > 0 and s.goals = 0 order by p.last_name limit 1`;
    await sql`update gameweeks set status = 'closed'`;
    const rows = (await sql.unsafe(findRowsSql(993, def.last_name))) as unknown as DbStatRow[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    const before = row.points;

    await sql.unsafe(buildOverrideSql({ ...row, current: rowToStat(row) }, { goals: 1 }, 'протокол лиги'));

    const [after] = await sql`select goals, points, manual_override from player_match_stats where fixture_id = ${row.fixture_id} and player_id = ${row.player_id}`;
    expect(after).toMatchObject({ goals: 1, points: before + 6, manual_override: true });
    const [log] = await sql`select payload from audit_log where action = 'stat_override'`;
    expect(log.payload).toMatchObject({ reason: 'протокол лиги', before: { goals: 0, points: before }, after: { goals: 1, points: before + 6 } });
    const [gw] = await sql`select g.status from gameweeks g join fixtures f on f.gameweek_id = g.id where f.id = ${row.fixture_id}`;
    expect(gw.status).toBe('played');

    const html = matchPage(993);
    await upsertMatch(sql, seasonId, parseMatchPage(html, 993), html);
    const [kept] = await sql`select goals from player_match_stats where fixture_id = ${row.fixture_id} and player_id = ${row.player_id}`;
    expect(kept.goals).toBe(1);
  });

  it('разбор --set: известные поля и целые числа; иначе понятная ошибка', () => {
    expect(parseSet('goals=1, assists=0')).toEqual({ goals: 1, assists: 0 });
    expect(() => parseSet('points=10')).toThrow(/Неверное поле/);
    expect(() => parseSet('goals=-1')).toThrow(/Неверное поле/);
  });
});
