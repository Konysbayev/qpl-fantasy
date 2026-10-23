// Облактағы автоматты жүктеу: жүріп жатқан және жақында аяқталған матчтар, маусым күнтізбесі.
import type postgres from 'postgres';
import type { PoliteFetcher } from '../../kffleague/src/fetcher.js';
import { parseSitemapMatches } from '../../kffleague/src/sitemap.js';
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

const CALENDAR_EVERY_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;
// Премьер-лиганың бір маусымы: 16 клуб × 30 тур / 2
const SEASON_MATCHES = 240;

// Күнтізбе (спецификация 5.3): 3 сағатта бір рет карта сайттан жаңа матчтар мен жақын күндердегі ойналмаған матчтарды тексереді.
// Бір шақыруда maxPages беттен аспайды; бәрі өңделмесе, келесі шақыру ең ескі жүктелгендерден жалғастырады.
export async function syncCalendar(
  sql: postgres.Sql,
  fetcher: PoliteFetcher,
  opts: { seasonId: string; sourceSeasonId: number; year: number; now: Date; maxPages: number }
): Promise<SyncReport & { ran: boolean; complete: boolean }> {
  const report = { ...emptyReport(), ran: false, complete: false };
  const [state] = await sql<{ at: Date }[]>`select at from sync_state where key = 'calendar'`;
  if (state && opts.now.getTime() - state.at.getTime() < CALENDAR_EVERY_MS) return report;
  report.ran = true;

  const map = await fetcher.get('/sitemap.xml');
  if (map.status !== 200) {
    report.failed.push({ id: 0, error: `sitemap HTTP ${map.status}` });
    return report;
  }
  const day = (offset: number) => new Date(opts.now.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
  const [from, to] = [day(-1), day(14)];
  const skip = new Set((await sql<{ source_id: number }[]>`select source_id from source_skip`).map((r) => r.source_id));
  const known = new Map(
    (await sql<{ source_id: number; status: string; fetched_at: Date | null }[]>`
      select source_id, status, fetched_at from fixtures where season_id = ${opts.seasonId} and source_id is not null`).map((r) => [r.source_id, r])
  );

  const candidates: { id: number; order: number }[] = [];
  let knownCount = known.size;
  for (const { id, date } of parseSitemapMatches(map.body)) {
    if (!date.startsWith(`${opts.year}-`) || skip.has(id)) continue;
    const row = known.get(id);
    if (row) {
      if (row.status !== 'finished' && date >= from && date <= to) candidates.push({ id, order: row.fetched_at?.getTime() ?? 0 });
    } else if (knownCount >= SEASON_MATCHES) {
      await sql`insert into source_skip (source_id, reason) values (${id}, 'не Премьер-лига: все матчи сезона уже собраны') on conflict do nothing`;
      report.skipped.push(id);
    } else {
      candidates.push({ id, order: -1 });
    }
  }
  candidates.sort((a, b) => a.order - b.order || a.id - b.id);

  let pages = 0;
  for (const { id } of candidates) {
    if (pages >= opts.maxPages) return report;
    pages++;
    const outcome = await fetchAndStore(sql, fetcher, opts, id, report);
    if (outcome === 'limit') return report;
    if (outcome === 'stored' && !known.has(id)) knownCount++;
  }
  await sql`insert into sync_state (key, at) values ('calendar', ${opts.now}) on conflict (key) do update set at = excluded.at`;
  report.complete = true;
  return report;
}
