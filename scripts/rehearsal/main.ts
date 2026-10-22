// 2026 маусымының репетициясы: kffleague.kz-тен барлық матчты жергілікті базаға жүктеп, ұпайларды есептеп, есеп жазады.
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { DEFAULT_RULES } from '../../packages/core/src/rules.js';
import type { PointsLine } from '../../packages/core/src/scoring.js';
import type { Position } from '../../packages/core/src/types.js';
import { createPoliteFetcher } from '../../packages/kffleague/src/fetcher.js';
import { applyMigrations } from '../../packages/db/src/migrate.js';
import { recordRequest, syncSeason } from '../../packages/db/src/sync.js';
import { renderRehearsalReport, type RehearsalData } from './report.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/qpl_rehearsal';
const SOURCE_SEASON_ID = 200;
const YEAR = 2026;
const MAX_REQUESTS = Number(process.env.REHEARSAL_MAX_REQUESTS ?? 1000);
const PAUSE_MS = 3000;

// База жоқ болса, жасаймыз
const dbUrl = new URL(DATABASE_URL);
const admin = postgres({ ...parseAdmin(dbUrl), onnotice: () => {} });
const dbName = dbUrl.pathname.slice(1);
if ((await admin`select 1 from pg_database where datname = ${dbName}`).length === 0) await admin.unsafe(`create database ${dbName}`);
await admin.end();

const sql = postgres(DATABASE_URL, { onnotice: () => {} });
await sql.unsafe(`create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;`);
await applyMigrations(sql, path.join(import.meta.dirname, '..', '..', 'supabase', 'migrations'));

await sql`insert into seasons (year, source_season_id, scoring_rules, status)
  values (${YEAR}, ${SOURCE_SEASON_ID}, ${sql.json(DEFAULT_RULES as never)}, 'finished') on conflict (source_season_id) do nothing`;
const [{ id: seasonId }] = await sql`select id from seasons where source_season_id = ${SOURCE_SEASON_ID}`;

const fetcher = createPoliteFetcher({
  minIntervalMs: PAUSE_MS,
  maxRequests: MAX_REQUESTS,
  onRequest: async () => {
    await recordRequest(sql);
    if (fetcher.requestCount() % 25 === 0) console.log(`запросов: ${fetcher.requestCount()}`);
  }
});
const sync = await syncSeason(sql, fetcher, { seasonId, sourceSeasonId: SOURCE_SEASON_ID, year: YEAR });

// Есеп үшін деректер базадан алынады: алдыңғы іске қосулардағы матчтар да кіреді
type Row = { name: string; club: string; position: Position; points: number };
const name = sql`p.first_name || ' ' || p.last_name`;
const played = sql`f.season_id = ${seasonId} and f.status = 'finished'`;

const stored = await sql<{ source_id: number }[]>`select source_id from fixtures where season_id = ${seasonId} order by source_id`;
const review = await sql<{ source_id: number; needs_review: string[] }[]>`
  select source_id, needs_review from fixtures where season_id = ${seasonId} and cardinality(needs_review) > 0 order by source_id`;

const seasonTop = await sql<(Row & { goals: number; assists: number; minutes: number })[]>`
  select ${name} as name, c.name_ru as club, p.position, sum(s.points)::int as points,
         sum(s.goals)::int as goals, sum(s.assists)::int as assists, sum(s.minutes)::int as minutes
  from player_match_stats s join fixtures f on f.id = s.fixture_id join players p on p.id = s.player_id join clubs c on c.id = p.club_id
  where ${played} group by p.id, c.name_ru order by points desc, goals desc limit 20`;

const gws = await sql<{ id: string; number: number; matches: number }[]>`
  select g.id, g.number, count(f.id)::int as matches from gameweeks g join fixtures f on f.gameweek_id = g.id
  where ${played} group by g.id order by g.number`;
const tours: RehearsalData['tours'] = [];
for (const g of gws) {
  const top = await sql<Row[]>`
    select ${name} as name, c.name_ru as club, p.position, sum(s.points)::int as points
    from player_match_stats s join fixtures f on f.id = s.fixture_id join players p on p.id = s.player_id join clubs c on c.id = p.club_id
    where f.gameweek_id = ${g.id} and f.status = 'finished' group by p.id, c.name_ru order by points desc limit 5`;
  tours.push({ number: g.number, matches: g.matches, top });
}

// Қолмен тексеруге: үздік шабуылшы, үздік қорғаушы, ең көп құрғақ матчы бар қақпашы — әрқайсысының ең жақсы матчы
async function sample(where: postgres.PendingQuery<postgres.Row[]>, order: postgres.PendingQuery<postgres.Row[]>) {
  const [p] = await sql`select p.id from player_match_stats s join fixtures f on f.id = s.fixture_id join players p on p.id = s.player_id
    where ${played} and ${where} group by p.id order by ${order} limit 1`;
  if (!p) return null;
  const [m] = await sql<{ name: string; label: string; points: number; points_lines: PointsLine[] }[]>`
    select ${name} as name, s.points, s.points_lines,
           h.name_ru || ' ' || f.home_score || ':' || f.away_score || ' ' || a.name_ru || ' (тур ' || g.number || ')' as label
    from player_match_stats s join fixtures f on f.id = s.fixture_id join players p on p.id = s.player_id
      join clubs h on h.id = f.home_club_id join clubs a on a.id = f.away_club_id join gameweeks g on g.id = f.gameweek_id
    where s.player_id = ${p.id} and ${played} order by s.points desc limit 1`;
  return { name: m.name, match: m.label, lines: m.points_lines, total: m.points };
}
const samples = [
  await sample(sql`p.position = 'FWD'`, sql`sum(s.points) desc`),
  await sample(sql`p.position = 'DEF'`, sql`sum(s.points) desc`),
  await sample(sql`p.position = 'GK'`, sql`count(*) filter (where s.minutes >= 60 and s.conceded = 0) desc`)
].filter((x): x is NonNullable<typeof x> => x !== null);

const date = new Date().toISOString().slice(0, 10);
const report = renderRehearsalReport({
  date,
  requests: fetcher.requestCount(),
  sync: {
    stored: stored.map((r) => r.source_id),
    skipped: sync.skipped,
    failed: sync.failed,
    needsReview: review.map((r) => ({ id: r.source_id, reasons: r.needs_review }))
  },
  tours,
  seasonTop,
  samples
});
const reportPath = path.join('docs', 'research', `${date}-rehearsal-2026.md`);
fs.writeFileSync(reportPath, report);
console.log(`Отчёт: ${reportPath}; сохранено ${stored.length}, пропущено ${sync.skipped.length}, ошибок ${sync.failed.length}`);
await sql.end();

function parseAdmin(u: URL) {
  return { host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: 'postgres', max: 1 };
}
