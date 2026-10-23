import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PoliteFetcher } from '../../../packages/kffleague/src/fetcher.js';
import type { Send } from '../../../packages/db/src/notify.js';
import { scoreGameweek } from '../../../packages/db/src/finalize.js';
import { createFirstSquad } from '../../../packages/db/src/squad.js';
import { freshDb } from '../../../packages/db/test/helpers.js';
import { START, newUser, seedLeague, standardPicks, type League } from '../../../packages/db/test/league.js';
import { cronTick } from '../cron-tick/handler.js';

const H = 3_600_000;
const SECRET = 'cron-test-secret';
let sql: postgres.Sql;
let L: League;
let created: number[];
let sent: string[];

beforeAll(async () => {
  sql = await freshDb('qpl_test_fn_cron');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  L = await seedLeague(sql);
  await sql`truncate sync_state, notifications_sent, gameweek_scores, source_usage, audit_log, price_changes`;
  await sql`update seasons set source_season_id = 200 where id = ${L.seasonId}`;
  created = [];
  sent = [];
  const user = await newUser(sql);
  const r = await createFirstSquad(sql, user, new Date(START.getTime() - H), standardPicks(L), 1);
  if (!r.ok) throw new Error(r.error);
  await sql`insert into fixtures (season_id, gameweek_id, home_club_id, away_club_id, kickoff, status)
    values (${L.seasonId}, ${L.gws[0].id}, ${L.clubs[0]}, ${L.clubs[1]}, ${new Date(START.getTime() + H)}, 'finished')`;
});

const quietFetcher = (get: PoliteFetcher['get'] = async () => ({ status: 404, body: '' })): PoliteFetcher => ({ get, requestCount: () => 0 });
const send: Send = async (_chatId, text) => {
  sent.push(text);
  return { ok: true, status: 200 };
};
const deps = (over: Partial<Parameters<typeof cronTick>[1]> = {}) => ({
  sql, cronSecret: SECRET, now: new Date(START.getTime() + 4 * H), send,
  fetcher: (max: number) => {
    created.push(max);
    return quietFetcher();
  },
  ...over
});
const req = (secret: string | null = SECRET) => new Request('https://x/functions/v1/cron-tick', { method: 'POST', headers: secret ? { 'x-cron-secret': secret } : {} });

describe('cron-tick', () => {
  it('без секрета или с неверным секретом → 401', async () => {
    expect((await cronTick(req(null), deps())).status).toBe(401);
    expect((await cronTick(req('wrong'), deps())).status).toBe(401);
  });

  it('другой вызов уже идёт → busy, ничего не делает', async () => {
    await sql`insert into sync_state (key, at) values ('tick_lock', ${new Date(START.getTime() + 4 * H - 60_000)})`;
    const res = await cronTick(req(), deps());
    expect(await res.json()).toEqual({ skipped: 'busy' });
    expect(created).toEqual([]);
  });

  it('тур сыгран → итоги разосланы; повторный вызов ничего не повторяет', async () => {
    const first = await (await cronTick(req(), deps())).json();
    expect(first.transitions).toEqual([expect.objectContaining({ number: 1, to: 'played' })]);
    expect(first.errors).toEqual([]);
    expect(sent).toEqual([expect.stringContaining('1-тур аяқталды')]);
    const second = await (await cronTick(req(), deps())).json();
    expect(second.transitions).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(await sql`select 1 from sync_state where key = 'tick_lock'`).toHaveLength(0);
  });

  it('первый запуск: давно прошедшие туры закрываются молча — без итогов и без изменения цен', async () => {
    const body = await (await cronTick(req(), deps({ now: new Date(START.getTime() + 30 * 86_400_000) }))).json();
    expect(body.transitions.map((t: { number: number; to: string }) => [t.number, t.to])).toEqual([[1, 'closed'], [2, 'closed'], [3, 'closed']]);
    expect(sent).toEqual([]);
    expect(await sql`select 1 from price_changes`).toHaveLength(0);
  });

  it('прошлый вызов упал после закрытия тура — итоги и цены всё равно делаются, по одному разу', async () => {
    // Прошлый вызов успел посчитать очки и закрыть тур, но упал до рассылки и цен
    await scoreGameweek(sql, L.gws[0].id);
    await sql`update gameweeks set status = 'closed' where id = ${L.gws[0].id}`;
    await (await cronTick(req(), deps({ now: new Date(START.getTime() + 30 * H) }))).json();
    expect(sent).toEqual([expect.stringContaining('1-тур аяқталды')]);
    expect(await sql`select 1 from price_changes where gameweek_id = ${L.gws[0].id}`).toHaveLength(1);
    await cronTick(req(), deps({ now: new Date(START.getTime() + 31 * H) }));
    expect(sent).toHaveLength(1);
  });

  it('тур закрылся позже чем через 7 дней после дедлайна (поздний матч) — итоги всё равно приходят', async () => {
    await sql`update fixtures set kickoff = ${new Date(START.getTime() + 9 * 86_400_000)} where gameweek_id = ${L.gws[0].id}`;
    await cronTick(req(), deps({ now: new Date(START.getTime() + 9 * 86_400_000 + 3 * H) }));
    expect(sent).toEqual(expect.arrayContaining([expect.stringContaining('1-тур аяқталды')]));
  });

  it('ошибка загрузки календаря не мешает подсчёту очков', async () => {
    const res = await cronTick(req(), deps({ fetcher: () => quietFetcher(async () => { throw new Error('boom'); }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors).toEqual([{ step: 'calendar', error: 'boom' }]);
    expect(await sql`select 1 from gameweek_scores`).toHaveLength(1);
    expect(await sql`select 1 from audit_log where action = 'cron_error'`).toHaveLength(1);
  });

  it('дневной лимит запросов исчерпан → сайт не трогаем', async () => {
    await sql`insert into source_usage (day, requests) values (current_date, 300)`;
    await cronTick(req(), deps({ now: new Date() }));
    expect(created).toEqual([]);
  });
});
