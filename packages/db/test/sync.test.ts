import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type postgres from 'postgres';
import { parseMatchPage } from '../../kffleague/src/match.js';
import type { PoliteFetcher } from '../../kffleague/src/fetcher.js';
import { buildPlayerMatchStats } from '../../core/src/match-stats.js';
import { scorePlayer } from '../../core/src/scoring.js';
import { DEFAULT_RULES } from '../../core/src/rules.js';
import { recordRequest, syncSeason, upsertMatch } from '../src/sync.js';
import { freshDb } from './helpers.js';

const fixture = (id: number) =>
  gunzipSync(fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'kffleague', 'test', 'fixtures', `match-${id}.html.gz`))).toString('utf-8');

let sql: postgres.Sql;
let seasonId: string;

beforeAll(async () => {
  sql = await freshDb('qpl_test_sync');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  await sql`truncate seasons, clubs, players, gameweeks, fixtures, player_match_stats, source_raw, source_usage, source_skip cascade`;
  const [s] = await sql`insert into seasons (year, source_season_id, scoring_rules) values (2026, 200, ${sql.json(DEFAULT_RULES as never)}) returning id`;
  seasonId = s.id;
});

const count = async (table: string) => (await sql.unsafe(`select count(*)::int as n from ${table}`))[0].n as number;

function fakeFetcher(pages: Record<string, { status: number; body: string }>): PoliteFetcher & { paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    async get(p: string) {
      paths.push(p);
      return pages[p] ?? { status: 404, body: 'not found' };
    },
    requestCount: () => paths.length
  };
}

describe('upsertMatch', () => {
  it('матч 993 сохраняется: 2 клуба, игроки, тур 14, очки Оксанена совпадают с подсчётом', async () => {
    const html = fixture(993);
    const facts = parseMatchPage(html, 993);
    await upsertMatch(sql, seasonId, facts, html);

    expect(await count('clubs')).toBe(2);
    expect(await count('fixtures')).toBe(1);
    const [gw] = await sql`select number from gameweeks`;
    expect(gw.number).toBe(14);

    const stat = buildPlayerMatchStats(facts).stats.find((s) => s.playerSourceId === 2560)!;
    const [row] = await sql`select pms.points, pms.goals, pms.minutes, p.position from player_match_stats pms join players p on p.id = pms.player_id where p.source_id = 2560`;
    expect(row).toMatchObject({ goals: 1, minutes: stat.minutes, points: scorePlayer(stat, row.position, DEFAULT_RULES).total });
    expect(await count('player_match_stats')).toBe(facts.lineups.length);
  });

  it('повторный upsert того же матча не создаёт дублей', async () => {
    const html = fixture(993);
    const facts = parseMatchPage(html, 993);
    await upsertMatch(sql, seasonId, facts, html);
    const stats = await count('player_match_stats');
    await upsertMatch(sql, seasonId, facts, html);
    expect(await count('player_match_stats')).toBe(stats);
    expect(await count('fixtures')).toBe(1);
    expect(await count('players')).toBe(facts.lineups.length);
    expect(await count('source_raw')).toBe(1);
  });

  it('manual_override не перезаписывается', async () => {
    const html = fixture(993);
    const facts = parseMatchPage(html, 993);
    await upsertMatch(sql, seasonId, facts, html);
    await sql`update player_match_stats set goals = 5, points = 99, manual_override = true
      where player_id = (select id from players where source_id = 2560)`;
    await upsertMatch(sql, seasonId, facts, html);
    const [row] = await sql`select goals, points from player_match_stats where player_id = (select id from players where source_id = 2560)`;
    expect(row).toEqual({ goals: 5, points: 99 });
  });

  it('перенесённый матч: новая дата и тур обновляются', async () => {
    const html = fixture(993);
    const facts = parseMatchPage(html, 993);
    await upsertMatch(sql, seasonId, facts, html);
    await upsertMatch(sql, seasonId, { ...facts, tour: 15, kickoff: '2026-06-28T16:00:00+05:00' }, html);
    const [f] = await sql`select f.kickoff, g.number from fixtures f join gameweeks g on g.id = f.gameweek_id`;
    expect(f.number).toBe(15);
    expect(new Date(f.kickoff).toISOString()).toBe('2026-06-28T11:00:00.000Z');
  });

  it('будущий матч 1109 сохраняется без статистики игроков', async () => {
    const html = fixture(1109);
    await upsertMatch(sql, seasonId, parseMatchPage(html, 1109), html);
    const [f] = await sql`select status from fixtures`;
    expect(f.status).toBe('upcoming');
    expect(await count('player_match_stats')).toBe(0);
  });

  it('дедлайн тура = первый матч тура минус 1 час и сдвигается, если матч перенесли раньше', async () => {
    const html = fixture(993);
    const facts = parseMatchPage(html, 993);
    await upsertMatch(sql, seasonId, facts, html);
    const deadline = async () => new Date((await sql`select deadline from gameweeks where number = 14`)[0].deadline).toISOString();
    expect(await deadline()).toBe('2026-06-21T12:00:00.000Z');
    await upsertMatch(sql, seasonId, { ...facts, kickoff: '2026-06-20T15:00:00+05:00' }, html);
    expect(await deadline()).toBe('2026-06-20T09:00:00.000Z');
  });
});

describe('syncSeason', () => {
  const sitemap = (ids: number[]) =>
    `<urlset>${ids.map((id) => `<url><loc>https://kffleague.kz/matches/${id}</loc><lastmod>2026-06-21T00:00:00.000Z</lastmod></url>`).join('')}
     <url><loc>https://kffleague.kz/matches/5</loc><lastmod>2025-06-21T00:00:00.000Z</lastmod></url></urlset>`;
  // Деректер HTML ішінде экрандалған жол ретінде жатыр: тырнақшалар \" түрінде
  const otherSeason = fixture(993).replaceAll('\\"season_id\\":200', '\\"season_id\\":71');

  it('syncSeason: чужой сезон → source_skip, сломанная страница → failed, остальные сохраняются', async () => {
    const f = fakeFetcher({
      '/sitemap.xml': { status: 200, body: sitemap([993, 2, 3, 4]) },
      '/ru/matches/993': { status: 200, body: fixture(993) },
      '/ru/matches/2': { status: 200, body: otherSeason.replaceAll('\\"id\\":993,\\"date\\"', '\\"id\\":2,\\"date\\"') },
      '/ru/matches/3': { status: 200, body: '<html>403 Forbidden</html>' },
      '/ru/matches/4': { status: 403, body: 'forbidden' }
    });
    const r = await syncSeason(sql, f, { seasonId, sourceSeasonId: 200, year: 2026 });
    expect(r.stored).toEqual([993]);
    expect(r.skipped).toEqual([2]);
    expect(r.failed.map((x) => x.id)).toEqual([3, 4]);
    expect(f.paths).not.toContain('/ru/matches/5');
    expect((await sql`select source_id from source_skip`).map((x) => x.source_id)).toEqual([2]);

    // Қайта іске қосу: аяқталған матч пен бөтен сезон қайта жүктелмейді
    const again = fakeFetcher({ '/sitemap.xml': { status: 200, body: sitemap([993, 2]) } });
    await syncSeason(sql, again, { seasonId, sourceSeasonId: 200, year: 2026 });
    expect(again.paths).toEqual(['/sitemap.xml']);
  });

  it('недоступный sitemap → ошибка', async () => {
    await expect(syncSeason(sql, fakeFetcher({}), { seasonId, sourceSeasonId: 200, year: 2026 })).rejects.toThrow(/sitemap/);
  });
});

describe('recordRequest', () => {
  it('считает запросы за день в source_usage', async () => {
    await recordRequest(sql);
    await recordRequest(sql);
    const [row] = await sql`select requests from source_usage where day = current_date`;
    expect(row.requests).toBe(2);
  });
});
