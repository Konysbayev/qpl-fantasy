// Кесте бойынша 15 минут сайын: матчтар → күнтізбе → тур күйлері мен ұпайлар → бағалар → хабарламалар.
// Әр қадам өз try/catch ішінде: біреуі құласа, қалғаны орындалады; қате audit_log-қа жазылады.
import type postgres from 'postgres';
import type { PoliteFetcher } from '../../../packages/kffleague/src/fetcher.js';
import { matchesToRefresh, refreshMatches, syncCalendar } from '../../../packages/db/src/auto-sync.js';
import { advanceGameweeks, type Transition } from '../../../packages/db/src/finalize.js';
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

function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function cronTick(req: Request, deps: CronDeps): Promise<Response> {
  const { sql, now } = deps;
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
    if (budget > 0 && season.source_season_id !== null) {
      const fetcher = deps.fetcher(budget);
      const opts = { seasonId: season.id, sourceSeasonId: season.source_season_id };
      // Жүріп жатқан матчтар бірінші: олардың ұпайы ойыншыларға маңыздырақ
      report.matches = await step('matches', async () => refreshMatches(sql, fetcher, { ...opts, ids: await matchesToRefresh(sql, season.id, now) }));
      // Карта сайтқа 1 сұрау және кемінде 1 бет қалуы керек
      const left = budget - fetcher.requestCount();
      if (left >= 2) report.calendar = await step('calendar', () => syncCalendar(sql, fetcher, { ...opts, year: season.year, now, maxPages: left - 1 }));
    }

    const transitions = (await step('gameweeks', () => advanceGameweeks(sql, season.id, now))) ?? [];
    report.transitions = transitions;
    report.prices = [];
    report.notifications = [];
    const recent = new Set(
      (await sql<{ id: string }[]>`select id from gameweeks where id = any(${transitions.map((t) => t.gameweekId)}::uuid[])
        and deadline >= ${new Date(now.getTime() - RECENT_MS)}`).map((r) => r.id)
    );
    for (const t of (transitions as Transition[]).filter((x) => recent.has(x.gameweekId))) {
      // Кесте өткізіп алса (live → closed), қорытынды бәрібір жіберіледі; қайталанбайды
      if (t.to === 'played' || (t.to === 'closed' && t.from !== 'played')) {
        (report.notifications as unknown[]).push(await step('results', () => sendNotification(sql, deps.send, { gameweekId: t.gameweekId, number: t.number, kind: 'results' })));
      }
      if (t.to === 'closed') (report.prices as unknown[]).push(await step('prices', () => applyPriceChanges(sql, season.id, t.gameweekId, now)));
    }
    for (const r of (await step('reminders', () => dueReminders(sql, season.id, now))) ?? []) {
      (report.notifications as unknown[]).push(await step('reminders', () => sendNotification(sql, deps.send, r)));
    }
    return json(report);
  } finally {
    await sql`delete from sync_state where key = 'tick_lock'`;
  }
}
