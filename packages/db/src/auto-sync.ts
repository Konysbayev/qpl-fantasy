// Облактағы автоматты жүктеу: жүріп жатқан және жақында аяқталған матчтар, маусым күнтізбесі.
import type postgres from 'postgres';
import type { PoliteFetcher } from '../../kffleague/src/fetcher.js';
import { fetchAndStore, type SyncReport } from './sync.js';

const emptyReport = (): SyncReport => ({ stored: [], skipped: [], failed: [], needsReview: [] });

// Қазір жүктеу керек матчтар: жүріп жатқандар (басталғаннан 6 сағатқа дейін) және
// аяқталғаннан кейін бір рет қайта тексерілетіндер (басталғаннан 4 сағат өткен соң, 48 сағат ішінде)
export async function matchesToRefresh(sql: postgres.Sql, seasonId: string, now: Date): Promise<number[]> {
  const rows = await sql<{ source_id: number }[]>`
    select source_id from fixtures
    where season_id = ${seasonId} and source_id is not null and (
      (status <> 'finished' and kickoff <= ${now} and ${now} <= kickoff + interval '6 hours')
      or (status = 'finished' and kickoff + interval '4 hours' <= ${now} and ${now} <= kickoff + interval '48 hours'
          and (fetched_at is null or fetched_at < kickoff + interval '4 hours'))
    )
    order by kickoff, source_id`;
  return rows.map((r) => r.source_id);
}

export async function refreshMatches(
  sql: postgres.Sql,
  fetcher: PoliteFetcher,
  opts: { seasonId: string; sourceSeasonId: number; ids: number[] }
): Promise<SyncReport> {
  const report = emptyReport();
  for (const id of opts.ids) {
    if ((await fetchAndStore(sql, fetcher, opts, id, report)) === 'limit') break;
  }
  return report;
}
