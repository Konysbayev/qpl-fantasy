import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../../packages/core/src/rules.js';
import { parseMatchPage } from '../../../packages/kffleague/src/match.js';
import { eventRows } from '../../../packages/db/src/events.js';
import { upsertMatch } from '../../../packages/db/src/sync.js';
import { freshDb } from '../../../packages/db/test/helpers.js';
import { matchPage } from '../../../packages/db/test/source.js';
import { buildBackfillSql } from '../backfill-events.js';

let sql: postgres.Sql;
beforeAll(async () => {
  sql = await freshDb('qpl_test_backfill_events');
  const [s] = await sql`insert into seasons (year, source_season_id, scoring_rules) values (2026, 200, ${sql.json(DEFAULT_RULES as never)}) returning id`;
  const html = matchPage(993);
  await upsertMatch(sql, s.id, parseMatchPage(html, 993), html);
});
afterAll(async () => {
  await sql?.end();
});

describe('buildBackfillSql', () => {
  it('восстанавливает события по id источника; уже заполненные матчи не трогает', async () => {
    const rows = eventRows(parseMatchPage(matchPage(993), 993).events);
    await sql`delete from match_events`;
    for (const s of buildBackfillSql([{ fixtureSourceId: 993, rows }], 10)) await sql.unsafe(s);
    const [{ n }] = await sql`select count(*)::int as n from match_events`;
    expect(n).toBe(rows.length);
    await sql`update match_events set minute = 99 where idx = 0`;
    for (const s of buildBackfillSql([{ fixtureSourceId: 993, rows }], 10)) await sql.unsafe(s);
    const [first] = await sql`select minute from match_events where idx = 0`;
    expect(first.minute).toBe(99);
  });
});
