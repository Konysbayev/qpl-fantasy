// Дерек көзі → база: матч фактілерін сақтайды, ойыншы статистикасы мен ұпайларын есептейді.
import type postgres from 'postgres';
import type { MatchFacts, Position } from '../../core/src/types.js';
import type { ScoringRules } from '../../core/src/rules.js';
import { buildPlayerMatchStats } from '../../core/src/match-stats.js';
import { scorePlayer } from '../../core/src/scoring.js';
import { assignGameweeks } from '../../core/src/gameweeks.js';
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

    const [fixture] = await tx`insert into fixtures (source_id, season_id, source_tour, home_club_id, away_club_id, kickoff, status, home_score, away_score, needs_review)
      values (${facts.sourceId}, ${seasonId}, ${facts.tour}, ${clubIds.get(facts.home.sourceId)!}, ${clubIds.get(facts.away.sourceId)!},
              ${facts.kickoff}, ${facts.status}, ${facts.homeScore}, ${facts.awayScore}, ${needsReview})
      on conflict (source_id) do update set season_id = excluded.season_id, source_tour = excluded.source_tour, home_club_id = excluded.home_club_id,
        away_club_id = excluded.away_club_id, kickoff = excluded.kickoff, status = excluded.status, home_score = excluded.home_score,
        away_score = excluded.away_score, needs_review = excluded.needs_review, updated_at = now()
      returning id`;
    await reassignGameweeks(tx, seasonId);

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

// Маусымның барлық матчын турларға күні бойынша қайта бөледі, бекітілмеген дедлайндарды жаңартады
async function reassignGameweeks(tx: postgres.TransactionSql, seasonId: string): Promise<void> {
  const fixtures = await tx<{ id: string; source_tour: number | null; kickoff: Date }[]>`
    select id, source_tour, kickoff from fixtures where season_id = ${seasonId}`;
  const lockedRows = await tx<{ number: number; deadline: Date }[]>`
    select number, deadline from gameweeks where season_id = ${seasonId} and deadline_locked and deadline is not null`;
  const { deadlines, assignment } = assignGameweeks(
    fixtures.map((f) => ({ id: f.id, sourceTour: f.source_tour, kickoff: f.kickoff.toISOString() })),
    new Map(lockedRows.map((r) => [r.number, r.deadline]))
  );
  const ids = new Map<number, string>();
  for (const [number, deadline] of deadlines) {
    const [gw] = await tx`insert into gameweeks (season_id, number, deadline) values (${seasonId}, ${number}, ${deadline})
      on conflict (season_id, number) do update set deadline = case when gameweeks.deadline_locked then gameweeks.deadline else excluded.deadline end
      returning id`;
    ids.set(number, gw.id);
  }
  for (const f of fixtures) {
    const n = assignment.get(f.id);
    await tx`update fixtures set gameweek_id = ${n == null ? null : ids.get(n) ?? null} where id = ${f.id}`;
  }
}

export async function syncSeason(
  sql: postgres.Sql,
  fetcher: PoliteFetcher,
  opts: { seasonId: string; sourceSeasonId: number; year: number; refetchFinished?: boolean; refetchRecentDays?: number; now?: Date; expectedMatches?: number }
): Promise<SyncReport> {
  const report: SyncReport = { stored: [], skipped: [], failed: [], needsReview: [] };
  const map = await fetcher.get('/sitemap.xml');
  if (map.status !== 200) throw new Error(`sitemap недоступен: HTTP ${map.status}`);

  const candidates = parseSitemapMatches(map.body).filter((m) => m.date.startsWith(`${opts.year}-`));
  // Соңғы күндердегі аяқталған матчтар қайта жүктеледі: лига хаттаманы түзетуі мүмкін
  const now = opts.now ?? new Date();
  const recentDays = opts.refetchRecentDays ?? 3;
  const skip = new Set((await sql<{ source_id: number }[]>`select source_id from source_skip`).map((r) => r.source_id));
  const finished = opts.refetchFinished
    ? new Set<number>()
    : new Set(
        (
          await sql<{ source_id: number }[]>`select source_id from fixtures where status = 'finished'
            and kickoff < ${new Date(now.getTime() - recentDays * 24 * 3_600_000)}`
        ).map((r) => r.source_id)
      );

  // Тек Премьер-лига керек: маусымның барлық матчы (16 клуб × 30 тур / 2 = 240) жиналса, жаңа беттер басқа турнирлердікі
  const expected = opts.expectedMatches ?? 240;
  const known = new Set((await sql<{ source_id: number }[]>`select source_id from fixtures where season_id = ${opts.seasonId}`).map((r) => r.source_id));

  for (const { id } of candidates) {
    if (skip.has(id) || finished.has(id)) continue;
    if (!known.has(id) && known.size >= expected) {
      await sql`insert into source_skip (source_id, reason) values (${id}, 'не Премьер-лига: все матчи сезона уже собраны') on conflict do nothing`;
      report.skipped.push(id);
      continue;
    }
    const outcome = await fetchAndStore(sql, fetcher, opts, id, report);
    if (outcome === 'limit') break;
    if (outcome === 'stored') known.add(id);
  }
  return report;
}

// Бір матч беті: жүктеу → талдау → сақтау. Нәтиже есепке жазылады; сұрау лимиті біткенде 'limit'
export async function fetchAndStore(
  sql: postgres.Sql,
  fetcher: PoliteFetcher,
  opts: { seasonId: string; sourceSeasonId: number },
  id: number,
  report: SyncReport
): Promise<'stored' | 'skipped' | 'failed' | 'limit'> {
  let page: { status: number; body: string };
  try {
    page = await fetcher.get(`/ru/matches/${id}`);
  } catch (err) {
    if (err instanceof RequestLimitError) {
      report.failed.push({ id, error: err.message });
      return 'limit';
    }
    throw err;
  }
  if (page.status !== 200) {
    report.failed.push({ id, error: `HTTP ${page.status}` });
    return 'failed';
  }
  try {
    const facts = parseMatchPage(page.body, id);
    if (facts.seasonSourceId !== opts.sourceSeasonId) {
      await sql`insert into source_skip (source_id, reason) values (${id}, ${`сезон ${facts.seasonSourceId}`}) on conflict do nothing`;
      report.skipped.push(id);
      return 'skipped';
    }
    const { needsReview } = await upsertMatch(sql, opts.seasonId, facts, page.body);
    // Тек сайттан нақты жүктелгенде белгіленеді (rebuildFromRaw бұл уақытты өзгертпейді)
    await sql`update fixtures set fetched_at = now() where source_id = ${id}`;
    report.stored.push(id);
    if (needsReview.length > 0) report.needsReview.push({ id, reasons: needsReview });
    return 'stored';
  } catch (err) {
    report.failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    return 'failed';
  }
}

// Сақталған шикі беттерден матчтарды қайта құрады (ереже немесе талдағыш өзгергенде; сайтқа сұрау жоқ)
export async function rebuildFromRaw(sql: postgres.Sql, seasonId: string, sourceSeasonId: number): Promise<{ rebuilt: number[]; failed: { id: number; error: string }[] }> {
  const out = { rebuilt: [] as number[], failed: [] as { id: number; error: string }[] };
  const ids = await sql<{ fixture_source_id: number }[]>`
    select r.fixture_source_id from source_raw r join fixtures f on f.source_id = r.fixture_source_id
    where f.season_id = ${seasonId} order by r.fixture_source_id`;
  for (const { fixture_source_id: id } of ids) {
    const [{ body }] = await sql<{ body: string }[]>`select body from source_raw where fixture_source_id = ${id}`;
    try {
      const facts = parseMatchPage(body, id);
      if (facts.seasonSourceId !== sourceSeasonId) throw new Error(`сезон ${facts.seasonSourceId}`);
      await upsertMatch(sql, seasonId, facts, body);
      out.rebuilt.push(id);
    } catch (err) {
      out.failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}
