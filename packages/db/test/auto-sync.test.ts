import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { parseMatchPage } from '../../kffleague/src/match.js';
import { RequestLimitError } from '../../kffleague/src/fetcher.js';
import { DEFAULT_RULES } from '../../core/src/rules.js';
import { upsertMatch } from '../src/sync.js';
import { matchesToRefresh, refreshMatches, syncCalendar } from '../src/auto-sync.js';
import { freshDb } from './helpers.js';
import { fakeFetcher, matchPage, sitemapXml } from './source.js';

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

  it('страница без составов (сайт поменял разметку) не стирает уже сохранённые очки', async () => {
    await store(993);
    const before = await sql`select count(*)::int as n, sum(points)::int as pts from player_match_stats`;
    const broken = matchPage(993).replaceAll('lineups', 'lineupz');
    const report = await refreshMatches(sql, fakeFetcher({ '/ru/matches/993': { status: 200, body: broken } }), { ...opts(), ids: [993] });
    expect(report.stored).toEqual([]);
    expect(report.failed).toEqual([{ id: 993, error: 'на странице нет составов — сохранённые данные оставлены' }]);
    expect(await sql`select count(*)::int as n, sum(points)::int as pts from player_match_stats`).toEqual(before);
    const [raw] = await sql`select body from source_raw where fixture_source_id = 993`;
    expect(raw.body.includes('lineupz')).toBe(false);
  });

  it('ручная правка (manual_override) переживает перезагрузку страницы', async () => {
    await store(993);
    await sql`update player_match_stats set goals = 5, points = 99, manual_override = true where player_id = (select id from players where source_id = 2560)`;
    await refreshMatches(sql, fakeFetcher({ '/ru/matches/993': { status: 200, body: matchPage(993) } }), { ...opts(), ids: [993] });
    const [row] = await sql`select goals, points from player_match_stats where player_id = (select id from players where source_id = 2560)`;
    expect(row).toMatchObject({ goals: 5, points: 99 });
  });
});

describe('syncCalendar', () => {
  const now = new Date('2026-06-21T06:00:00Z');
  const pages = (map: string) => ({
    '/sitemap.xml': { status: 200, body: map },
    '/ru/matches/993': { status: 200, body: matchPage(993) },
    '/ru/matches/896': { status: 200, body: matchPage(896) },
    '/ru/matches/1109': { status: 200, body: matchPage(1109) }
  });
  const map = sitemapXml([[993, '2026-06-21'], [896, '2026-06-22'], [1109, '2026-06-23'], [5, '2025-06-21']]);
  const run = (f: ReturnType<typeof fakeFetcher>, at: Date, maxPages = 2) => syncCalendar(sql, f, { ...opts(), year: 2026, now: at, maxPages });

  it('лимит страниц: обход продолжается в следующем вызове, отметка ставится только после полного обхода', async () => {
    const f1 = fakeFetcher(pages(map));
    const r1 = await run(f1, now);
    expect(r1).toMatchObject({ ran: true, complete: false });
    expect(f1.paths.filter((p) => p.startsWith('/ru/matches/'))).toHaveLength(2);
    expect(await sql`select * from sync_state`).toHaveLength(0);

    const f2 = fakeFetcher(pages(map));
    const r2 = await run(f2, now);
    expect(r2).toMatchObject({ ran: true, complete: true });
    expect(f2.paths.filter((p) => p.startsWith('/ru/matches/'))).toHaveLength(1);
    expect(f2.paths).not.toContain('/ru/matches/5');
    const [state] = await sql`select at from sync_state where key = 'calendar'`;
    expect(new Date(state.at).toISOString()).toBe(now.toISOString());

    const f3 = fakeFetcher(pages(map));
    expect(await run(f3, new Date(now.getTime() + H))).toMatchObject({ ran: false });
    expect(f3.paths).toEqual([]);
    const f4 = fakeFetcher(pages(map));
    expect(await run(f4, new Date(now.getTime() + 3 * H + 60_000))).toMatchObject({ ran: true });
  });

  it('известный несыгранный матч далеко в будущем не запрашивается, ближайший — запрашивается', async () => {
    await store(993);
    await store(896);
    await sql`update fixtures set status = 'upcoming'`;
    const f = fakeFetcher(pages(sitemapXml([[993, '2026-07-11'], [896, '2026-06-22']])));
    const r = await run(f, now, 10);
    expect(f.paths).toEqual(['/sitemap.xml', '/ru/matches/896']);
    expect(r).toMatchObject({ complete: true });
  });

  it('обход по частям завершается: недавно загруженные матчи не берутся снова, и календарь отмечается', async () => {
    await store(993);
    await store(896);
    await store(1109);
    await sql`update fixtures set status = 'upcoming', fetched_at = null`;
    const known = sitemapXml([[993, '2026-06-21'], [896, '2026-06-22'], [1109, '2026-06-23']]);
    const r1 = await run(fakeFetcher(pages(known)), now);
    expect(r1).toMatchObject({ complete: false });
    // Страницы в тестах — сыгранные матчи; в жизни это предстоящие, поэтому статус возвращаем
    await sql`update fixtures set status = 'upcoming'`;
    const f2 = fakeFetcher(pages(known));
    const r2 = await run(f2, new Date(now.getTime() + 15 * 60_000));
    expect(f2.paths.filter((p) => p.startsWith('/ru/matches/'))).toHaveLength(1);
    expect(r2).toMatchObject({ complete: true });
  });

  it('карта сайта недоступна — ошибка в отчёте, без исключения и без отметки', async () => {
    const r = await run(fakeFetcher({ '/sitemap.xml': { status: 503, body: '' } }), now);
    expect(r.failed).toEqual([{ id: 0, error: 'sitemap HTTP 503' }]);
    expect(r.complete).toBe(false);
    expect(await sql`select * from sync_state`).toHaveLength(0);
  });
});
