import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { parseMatchPage } from '../../kffleague/src/match.js';
import { RequestLimitError } from '../../kffleague/src/fetcher.js';
import { DEFAULT_RULES } from '../../core/src/rules.js';
import { upsertMatch } from '../src/sync.js';
import { matchesToRefresh, refreshMatches } from '../src/auto-sync.js';
import { freshDb } from './helpers.js';
import { fakeFetcher, matchPage } from './source.js';

const H = 3_600_000;
let sql: postgres.Sql;
let seasonId: string;
const opts = () => ({ seasonId, sourceSeasonId: 200 });

beforeAll(async () => {
  sql = await freshDb('qpl_test_auto_sync');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  await sql`truncate seasons, clubs, players, gameweeks, fixtures, player_match_stats, source_raw, source_usage, source_skip, sync_state cascade`;
  const [s] = await sql`insert into seasons (year, source_season_id, scoring_rules, status) values (2026, 200, ${sql.json(DEFAULT_RULES as never)}, 'active') returning id`;
  seasonId = s.id;
});

async function store(id: number) {
  const html = matchPage(id);
  await upsertMatch(sql, seasonId, parseMatchPage(html, id), html);
}
const setFixture = (id: number, f: { kickoff: Date; status: string; fetchedAt: Date | null }) =>
  sql`update fixtures set kickoff = ${f.kickoff}, status = ${f.status}, fetched_at = ${f.fetchedAt} where source_id = ${id}`;

describe('matchesToRefresh', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  const at = (h: number) => new Date(now.getTime() + h * H);

  it('идущий матч — в списке; будущий и давно начавшийся незавершённый — нет', async () => {
    await store(993);
    await store(896);
    await store(1109);
    await setFixture(993, { kickoff: at(-1), status: 'live', fetchedAt: null });
    await setFixture(896, { kickoff: at(1), status: 'upcoming', fetchedAt: null });
    await setFixture(1109, { kickoff: at(-7), status: 'live', fetchedAt: null });
    expect(await matchesToRefresh(sql, seasonId, now)).toEqual([993]);
  });

  it('сыгранный матч перезагружается один раз через 4 часа после начала и только в течение 48 часов', async () => {
    await store(993);
    await store(896);
    await store(1109);
    await setFixture(993, { kickoff: at(-5), status: 'finished', fetchedAt: at(-3) });
    await setFixture(896, { kickoff: at(-5), status: 'finished', fetchedAt: at(-0.5) });
    await setFixture(1109, { kickoff: at(-72), status: 'finished', fetchedAt: at(-70) });
    expect(await matchesToRefresh(sql, seasonId, now)).toEqual([993]);
  });
});

describe('refreshMatches', () => {
  it('страница с ошибкой попадает в failed, остальные сохраняются; fetched_at заполняется', async () => {
    const f = fakeFetcher({ '/ru/matches/896': { status: 500, body: 'oops' }, '/ru/matches/993': { status: 200, body: matchPage(993) } });
    const report = await refreshMatches(sql, f, { ...opts(), ids: [896, 993] });
    expect(report.failed).toEqual([{ id: 896, error: 'HTTP 500' }]);
    expect(report.stored).toEqual([993]);
    const [row] = await sql`select fetched_at from fixtures where source_id = 993`;
    expect(row.fetched_at).not.toBeNull();
  });

  it('лимит запросов останавливает обход: следующие матчи не запрашиваются', async () => {
    const f = fakeFetcher({
      '/ru/matches/993': { status: 200, body: matchPage(993) },
      '/ru/matches/896': () => {
        throw new RequestLimitError('Достигнут лимит 1 запросов');
      }
    });
    const report = await refreshMatches(sql, f, { ...opts(), ids: [993, 896, 1109] });
    expect(report.stored).toEqual([993]);
    expect(report.failed.map((x) => x.id)).toEqual([896]);
    expect(f.paths).not.toContain('/ru/matches/1109');
  });

  it('ручная правка (manual_override) переживает перезагрузку страницы', async () => {
    await store(993);
    await sql`update player_match_stats set goals = 5, points = 99, manual_override = true where player_id = (select id from players where source_id = 2560)`;
    await refreshMatches(sql, fakeFetcher({ '/ru/matches/993': { status: 200, body: matchPage(993) } }), { ...opts(), ids: [993] });
    const [row] = await sql`select goals, points from player_match_stats where player_id = (select id from players where source_id = 2560)`;
    expect(row).toMatchObject({ goals: 5, points: 99 });
  });
});
