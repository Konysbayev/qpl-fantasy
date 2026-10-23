// Кесте бойынша 15 минут сайын: матчтар → күнтізбе → тур күйлері мен ұпайлар → бағалар → хабарламалар.
// Әр қадам өз try/catch ішінде: біреуі құласа, қалғаны орындалады; қате audit_log-қа жазылады.
import type postgres from 'postgres';
import type { PoliteFetcher } from '../../../packages/kffleague/src/fetcher.js';
import { matchesToRefresh, refreshMatches, syncCalendar } from '../../../packages/db/src/auto-sync.js';
import { advanceGameweeks } from '../../../packages/db/src/finalize.js';
import { dueReminders, sendNotification, type Send } from '../../../packages/db/src/notify.js';
import { applyPriceChanges } from '../../../packages/db/src/prices.js';
import { json } from '../_shared/http.js';

export interface CronDeps {
  sql: postgres.Sql;
  cronSecret: string;
  now: Date;
  fetcher: (maxRequests: number) => PoliteFetcher;
  send: Send;
}

// Бір шақыруда — 20 бет, тәулігіне — 300 сұрау (сайтқа ұқыпты жүктеме)
const PAGES_PER_TICK = 20;
const REQUESTS_PER_DAY = 300;
// Шақыру 150 секундтан аспайды; одан ескі құлып — құлаған шақырудың қалдығы
const LOCK_STALE = '10 minutes';
// Бұдан ескі турлар (мысалы, алғашқы іске қосуда) хабарламасыз және бағаны өзгертпей жабылады
const RECENT_MS = 7 * 86_400_000;
// Функция 150 секундта тоқтатылады: күнтізбе тек алғашқы 60 секундта басталады
const CALENDAR_BEFORE_MS = 60_000;
// Бір шақыруда күнтізбенің 5 беті: бұлттағы CPU шегіне сыю үшін (қалғаны келесі шақыруларда)
const CALENDAR_PAGES = 5;

function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function cronTick(req: Request, deps: CronDeps): Promise<Response> {
  const { sql, now } = deps;
  const started = Date.now();
  if (!sameSecret(req.headers.get('x-cron-secret') ?? '', deps.cronSecret)) return json({ error: 'unauthorized' }, 401);

  // Пулер транзакция режимінде advisory lock сенімсіз, сондықтан құлып — sync_state жолы
  const [lock] = await sql`insert into sync_state (key, at) values ('tick_lock', ${now})
    on conflict (key) do update set at = excluded.at where sync_state.at < ${now}::timestamptz - ${LOCK_STALE}::interval returning key`;
  if (!lock) return json({ skipped: 'busy' });

  try {
    const [season] = await sql<{ id: string; source_season_id: number | null; year: number }[]>`
      select id, source_season_id, year from seasons where status = 'active' order by year desc limit 1`;
    if (!season) return json({ skipped: 'no_season' });

    const report: Record<string, unknown> & { errors: { step: string; error: string }[] } = { errors: [] };
    const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        report.errors.push({ step: name, error });
        await sql`insert into audit_log (action, payload) values ('cron_error', ${sql.json({ step: name, error })})`.catch(() => {});
        return undefined;
      }
    };

    const [{ used }] = await sql<{ used: number }[]>`select coalesce((select requests from source_usage where day = current_date), 0)::int as used`;
    const budget = Math.min(PAGES_PER_TICK, REQUESTS_PER_DAY - used);
    const fetcher = budget > 0 && season.source_season_id !== null ? deps.fetcher(budget) : null;
    const opts = { seasonId: season.id, sourceSeasonId: season.source_season_id ?? 0 };
    // 1. Жүріп жатқан матчтар бірінші: олардың ұпайы ойыншыларға ең маңызды
    if (fetcher) report.matches = await step('matches', async () => refreshMatches(sql, fetcher, { ...opts, ids: await matchesToRefresh(sql, season.id, now) }));

    // 2. Тур күйлері және ұпайлар
    report.transitions = (await step('gameweeks', () => advanceGameweeks(sql, season.id, now))) ?? [];

    // 3. Қорытынды мен бағалар өткен ауысуларға емес, базадағы күйге қарап: құлаған шақырудан кейін келесісі жалғастырады.
    // Соңғы матчы 7 күннен ескі турлар (алғашқы іске қосудағы өткен маусым) үнсіз қалады
    const recentFrom = new Date(now.getTime() - RECENT_MS);
    const pending = await sql<{ id: string; number: number; status: string; results: boolean; prices: boolean }[]>`
      select g.id, g.number, g.status,
             exists (select 1 from notifications_sent n where n.gameweek_id = g.id and n.kind = 'results') as results,
             exists (select 1 from price_changes p where p.gameweek_id = g.id) as prices
      from gameweeks g
      where g.season_id = ${season.id} and g.status in ('played', 'closed')
        and coalesce((select max(f.kickoff) from fixtures f where f.gameweek_id = g.id), g.deadline) >= ${recentFrom}
      order by g.deadline`;
    report.notifications = [];
    report.prices = [];
    for (const g of pending) {
      if (!g.results) (report.notifications as unknown[]).push(await step('results', () => sendNotification(sql, deps.send, { gameweekId: g.id, number: g.number, kind: 'results' })));
      if (g.status === 'closed' && !g.prices) (report.prices as unknown[]).push(await step('prices', () => applyPriceChanges(sql, season.id, g.id, now)));
    }

    // 4. Дедлайн еске салғыштары
    for (const r of (await step('reminders', () => dueReminders(sql, season.id, now))) ?? []) {
      (report.notifications as unknown[]).push(await step('reminders', () => sendNotification(sql, deps.send, r)));
    }

    // 5. Күнтізбе соңында: уақыт пен сұрау қалса ғана (карта сайтқа 1 сұрау және кемінде 1 бет)
    const left = fetcher ? budget - fetcher.requestCount() : 0;
    if (fetcher && left >= 2 && Date.now() - started < CALENDAR_BEFORE_MS) {
      report.calendar = await step('calendar', () => syncCalendar(sql, fetcher, { ...opts, year: season.year, now, maxPages: Math.min(left - 1, CALENDAR_PAGES) }));
    }
    return json(report);
  } finally {
    await sql`delete from sync_state where key = 'tick_lock'`;
  }
}
