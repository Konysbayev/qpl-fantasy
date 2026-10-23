// Сыйланған турлардың матч барысы (match_events) бұлтқа: жергілікті репетиция базасындағы шикі беттерден, сайтқа сұраусыз.
// Бұлтта оқиғалары бар матчтар өзгертілмейді (оларды cron-tick жаңартады).
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { parseMatchPage } from '../../packages/kffleague/src/match.js';
import { eventRows, type EventRow } from '../../packages/db/src/events.js';
import { envOpts, literal, runQuery } from './management.js';

const num = (v: number | null) => (v === null ? 'null::int' : String(Number(v)));

// Пачка — бірнеше матч толығымен (бір матч екі пачкаға бөлінбейді); оқиғалары бар матч өткізіледі
export function buildBackfillSql(matches: { fixtureSourceId: number; rows: EventRow[] }[], matchesPerBatch = 20): string[] {
  const out: string[] = [];
  for (let i = 0; i < matches.length; i += matchesPerBatch) {
    const values = matches.slice(i, i + matchesPerBatch).flatMap((m) =>
      m.rows.map((r) => `(${Number(m.fixtureSourceId)}, ${r.idx}, ${r.minute}, ${literal(r.kind)}, ${Number(r.teamSourceId)}, ${num(r.playerSourceId)}, ${num(r.otherSourceId)})`)
    );
    if (values.length === 0) continue;
    out.push(`insert into match_events (fixture_id, idx, minute, kind, club_id, player_id, other_player_id)
select f.id, v.idx, v.minute, v.kind, c.id, p.id, o.id
from (values ${values.join(',\n')}) as v(fsrc, idx, minute, kind, csrc, psrc, osrc)
join fixtures f on f.source_id = v.fsrc
join clubs c on c.source_id = v.csrc
left join players p on p.source_id = v.psrc
left join players o on o.source_id = v.osrc
where not exists (select 1 from match_events e where e.fixture_id = f.id)`);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const local = postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/qpl_rehearsal', { onnotice: () => {} });
  const sourceSeasonId = Number(process.env.SOURCE_SEASON_ID ?? 200);
  const raw = await local<{ fixture_source_id: number; body: string }[]>`select fixture_source_id, body from source_raw order by fixture_source_id`;
  await local.end();
  const matches: { fixtureSourceId: number; rows: EventRow[] }[] = [];
  for (const r of raw) {
    try {
      const facts = parseMatchPage(r.body, r.fixture_source_id);
      if (facts.seasonSourceId === sourceSeasonId && facts.status === 'finished') matches.push({ fixtureSourceId: r.fixture_source_id, rows: eventRows(facts.events) });
    } catch {
      // Талданбаған бет өткізіледі
    }
  }
  const opts = envOpts();
  const statements = buildBackfillSql(matches);
  for (const [i, s] of statements.entries()) await runQuery(opts, s, `пачка ${i + 1}/${statements.length}`);
  const [counts] = await runQuery(opts, 'select count(*) as events, count(distinct fixture_id) as fixtures from match_events');
  console.log(`Матчей с событиями: ${counts.fixtures}, событий: ${counts.events}`);
}
