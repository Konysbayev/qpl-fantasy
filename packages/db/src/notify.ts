// Боттағы хабарламалар: дедлайн еске салғыштары (24 және 2 сағат бұрын) және тур қорытындысы. Әрқайсысы тур бойынша бір рет.
import type postgres from 'postgres';
import { notifyText, type NotifyKind } from '../../core/src/notify-texts.js';

export type { NotifyKind };
export type Send = (chatId: number, text: string) => Promise<{ ok: boolean; status: number }>;

const H = 3_600_000;
// Telegram шегі — секундына 30 хабарлама; аралықта 40 мс
const PAUSE_MS = 40;

export function telegramSender(
  botToken: string,
  appUrl: string,
  fetchImpl: typeof fetch = fetch,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  timeoutMs = 10_000
): Send {
  return async (chatId, text) => {
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, reply_markup: { inline_keyboard: [[{ text: 'Ойнау', web_app: { url: appUrl } }]] } }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      await res.body?.cancel();
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false, status: 0 };
    } finally {
      await sleep(PAUSE_MS);
    }
  };
}

export interface Reminder {
  gameweekId: string;
  number: number;
  kind: 'deadline_24h' | 'deadline_2h';
  deadline: Date;
}

// Терезе өтіп кетсе (кесте істемей қалса), кеш еске салғыш жіберілмейді
export async function dueReminders(sql: postgres.Sql, seasonId: string, now: Date): Promise<Reminder[]> {
  const gws = await sql<{ id: string; number: number; deadline: Date; sent: string[] }[]>`
    select g.id, g.number, g.deadline, coalesce(array_agg(n.kind) filter (where n.kind is not null), '{}') as sent
    from gameweeks g left join notifications_sent n on n.gameweek_id = g.id
    where g.season_id = ${seasonId} and g.deadline > ${now} and g.deadline <= ${new Date(now.getTime() + 24 * H)}
    group by g.id order by g.deadline`;
  const out: Reminder[] = [];
  for (const g of gws) {
    const left = g.deadline.getTime() - now.getTime();
    const kind = left <= 2 * H ? 'deadline_2h' : 'deadline_24h';
    if (!g.sent.includes(kind)) out.push({ gameweekId: g.id, number: g.number, kind, deadline: g.deadline });
  }
  return out;
}

type Recipient = { id: string; telegram_id: string; lang: 'kk' | 'ru'; points: number | null; rank: number | null };

export async function sendNotification(
  sql: postgres.Sql,
  send: Send,
  n: { gameweekId: string; number: number; kind: NotifyKind; deadline?: Date }
): Promise<{ sent: number; failed: number } | null> {
  // Алдымен белгі: қатар келген шақырулар хабарламаны екі рет жібермейді
  const [claimed] = await sql`insert into notifications_sent (gameweek_id, kind) values (${n.gameweekId}, ${n.kind}) on conflict do nothing returning kind`;
  if (!claimed) return null;

  const recipients =
    n.kind === 'results'
      ? await sql<Recipient[]>`select u.id, u.telegram_id, u.lang, (gs.points + gs.penalty) as points, gs.rank
          from gameweek_scores gs join users u on u.id = gs.user_id
          where gs.gameweek_id = ${n.gameweekId} and coalesce(u.notify->>'enabled', 'true') <> 'false'`
      : await sql<Recipient[]>`select u.id, u.telegram_id, u.lang, null::int as points, null::int as rank from users u
          where coalesce(u.notify->>'enabled', 'true') <> 'false' and exists (
            select 1 from squads s join gameweeks g on g.id = s.gameweek_id
            where s.user_id = u.id and g.season_id = (select season_id from gameweeks where id = ${n.gameweekId}))`;
  const [{ managers }] = await sql<{ managers: number }[]>`select count(*)::int as managers from gameweek_scores where gameweek_id = ${n.gameweekId}`;

  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const text = notifyText(n.kind, r.lang, { gameweek: n.number, deadline: n.deadline, points: r.points ?? undefined, rank: r.rank ?? undefined, managers });
    const res = await send(Number(r.telegram_id), text);
    if (res.ok) {
      sent++;
      continue;
    }
    failed++;
    // Ботты бұғаттаған пайдаланушыға енді жазбаймыз
    if (res.status === 403) await sql`update users set notify = notify || '{"enabled": false, "blocked": true}'::jsonb where id = ${r.id}`;
  }
  return { sent, failed };
}
