// Дерек көзі → база: матч фактілерін сақтайды, ойыншы статистикасы мен ұпайларын есептейді.
import type postgres from 'postgres';
import type { MatchFacts, Position } from '../../core/src/types.js';
import type { ScoringRules } from '../../core/src/rules.js';
import { buildPlayerMatchStats } from '../../core/src/match-stats.js';
import { scorePlayer } from '../../core/src/scoring.js';
import { parseMatchPage } from '../../kffleague/src/match.js';
import { parseSitemapMatches } from '../../kffleague/src/sitemap.js';
import { RequestLimitError, type PoliteFetcher } from '../../kffleague/src/fetcher.js';

export interface SyncReport {
  stored: number[];
  skipped: number[];
  failed: { id: number; error: string }[];
  needsReview: { id: number; reasons: string[] }[];
}

export async function recordRequest(sql: postgres.Sql): Promise<void> {
  await sql`insert into source_usage (day, requests) values (current_date, 1)
    on conflict (day) do update set requests = source_usage.requests + 1`;
}

export async function upsertMatch(sql: postgres.Sql, seasonId: string, facts: MatchFacts, rawHtml: string): Promise<{ needsReview: string[] }> {
  const { stats, needsReview } = buildPlayerMatchStats(facts);

  await sql.begin(async (tx) => {
    const [season] = await tx<{ scoring_rules: ScoringRules }[]>`select scoring_rules from seasons where id = ${seasonId}`;
    if (!season) throw new Error(`Нет сезона ${seasonId}`);

    const clubIds = new Map<number, string>();
    for (const t of [facts.home, facts.away]) {
      const [c] = await tx`insert into clubs (source_id, name_ru, name_kz, logo_url) values (${t.sourceId}, ${t.name}, ${t.nameKz}, ${t.logoUrl})
        on conflict (source_id) do update set name_ru = excluded.name_ru, name_kz = coalesce(excluded.name_kz, clubs.name_kz), logo_url = coalesce(excluded.logo_url, clubs.logo_url)
        returning id`;
      clubIds.set(t.sourceId, c.id);
    }

    let gameweekId: string | null = null;
    if (facts.tour !== null) {
      await tx`insert into gameweeks (season_id, number) values (${seasonId}, ${facts.tour}) on conflict (season_id, number) do nothing`;
      [{ id: gameweekId }] = await tx`select id from gameweeks where season_id = ${seasonId} and number = ${facts.tour}`;
    }

    const [old] = await tx`select gameweek_id from fixtures where source_id = ${facts.sourceId}`;
    const [fixture] = await tx`insert into fixtures (source_id, season_id, gameweek_id, home_club_id, away_club_id, kickoff, status, home_score, away_score, needs_review)
      values (${facts.sourceId}, ${seasonId}, ${gameweekId}, ${clubIds.get(facts.home.sourceId)!}, ${clubIds.get(facts.away.sourceId)!},
              ${facts.kickoff}, ${facts.status}, ${facts.homeScore}, ${facts.awayScore}, ${needsReview})
      on conflict (source_id) do update set season_id = excluded.season_id, gameweek_id = excluded.gameweek_id, home_club_id = excluded.home_club_id,
        away_club_id = excluded.away_club_id, kickoff = excluded.kickoff, status = excluded.status, home_score = excluded.home_score,
        away_score = excluded.away_score, needs_review = excluded.needs_review, updated_at = now()
      returning id`;

    // Тур дедлайны — турдың алғашқы матчынан 1 сағат бұрын (ауыстырылған матчтың ескі туры да қайта есептеледі)
    for (const gw of new Set([gameweekId, old?.gameweek_id].filter(Boolean))) {
      await tx`update gameweeks set deadline = (select min(kickoff) - interval '1 hour' from fixtures where gameweek_id = ${gw}) where id = ${gw}`;
    }

    // Әр матчтың тек соңғы шикі беті сақталады
    await tx`delete from source_raw where fixture_source_id = ${facts.sourceId}`;
    await tx`insert into source_raw (fixture_source_id, body) values (${facts.sourceId}, ${rawHtml})`;

    await tx`delete from player_match_stats where fixture_id = ${fixture.id} and manual_override = false`;
    for (const s of stats) {
      const lp = facts.lineups.find((p) => p.sourceId === s.playerSourceId)!;
      if (lp.position === null) continue;
      const [player] = await tx<{ id: string; position: Position }[]>`insert into players (source_id, first_name, last_name, club_id, position, needs_review)
        values (${lp.sourceId}, ${lp.firstName}, ${lp.lastName}, ${clubIds.get(lp.teamSourceId)!}, ${lp.position}, true)
        on conflict (source_id) do update set first_name = excluded.first_name, last_name = excluded.last_name, club_id = excluded.club_id
        returning id, position`;
      // Позиция базадан алынады: әкімші оны өзгертуі мүмкін
      const pts = scorePlayer(s, player.position, season.scoring_rules);
      await tx`insert into player_match_stats (fixture_id, player_id, minutes, on_minute, off_minute, goals, assists, penalty_goals, own_goals,
          yellow, red, conceded, penalties_saved, penalties_missed, points, points_lines)
        values (${fixture.id}, ${player.id}, ${s.minutes}, ${s.onMinute}, ${s.offMinute}, ${s.goals}, ${s.assists}, ${s.penaltyGoals}, ${s.ownGoals},
          ${s.yellow}, ${s.red}, ${s.conceded}, ${s.penaltiesSaved}, ${s.penaltiesMissed}, ${pts.total}, ${tx.json(pts.lines as never)})
        on conflict (fixture_id, player_id) do nothing`;
    }
  });
  return { needsReview };
}

export async function syncSeason(
  sql: postgres.Sql,
  fetcher: PoliteFetcher,
  opts: { seasonId: string; sourceSeasonId: number; year: number; refetchFinished?: boolean }
): Promise<SyncReport> {
  const report: SyncReport = { stored: [], skipped: [], failed: [], needsReview: [] };
  const map = await fetcher.get('/sitemap.xml');
  if (map.status !== 200) throw new Error(`sitemap недоступен: HTTP ${map.status}`);

  const candidates = parseSitemapMatches(map.body).filter((m) => m.date.startsWith(`${opts.year}-`));
  const skip = new Set((await sql<{ source_id: number }[]>`select source_id from source_skip`).map((r) => r.source_id));
  const finished = opts.refetchFinished
    ? new Set<number>()
    : new Set((await sql<{ source_id: number }[]>`select source_id from fixtures where status = 'finished'`).map((r) => r.source_id));

  for (const { id } of candidates) {
    if (skip.has(id) || finished.has(id)) continue;
    let page: { status: number; body: string };
    try {
      page = await fetcher.get(`/ru/matches/${id}`);
    } catch (err) {
      if (err instanceof RequestLimitError) {
        report.failed.push({ id, error: err.message });
        break;
      }
      throw err;
    }
    if (page.status !== 200) {
      report.failed.push({ id, error: `HTTP ${page.status}` });
      continue;
    }
    try {
      const facts = parseMatchPage(page.body, id);
      if (facts.seasonSourceId !== opts.sourceSeasonId) {
        await sql`insert into source_skip (source_id, reason) values (${id}, ${`сезон ${facts.seasonSourceId}`}) on conflict do nothing`;
        report.skipped.push(id);
        continue;
      }
      const { needsReview } = await upsertMatch(sql, opts.seasonId, facts, page.body);
      report.stored.push(id);
      if (needsReview.length > 0) report.needsReview.push({ id, reasons: needsReview });
    } catch (err) {
      report.failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return report;
}
