import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { dueReminders, sendNotification, telegramSender, type Send } from '../src/notify.js';
import { freshDb } from './helpers.js';
import { seedLeague, type League } from './league.js';

const H = 3_600_000;
let sql: postgres.Sql;
let L: League;

beforeAll(async () => {
  sql = await freshDb('qpl_test_notify');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  L = await seedLeague(sql);
  await sql`truncate notifications_sent, gameweek_scores`;
});

async function user(tg: number, lang: 'kk' | 'ru', notify: object = {}): Promise<string> {
  const [u] = await sql`insert into users (telegram_id, display_name, lang, notify) values (${tg}, 'Т', ${lang}, ${sql.json(notify as never)}) returning id`;
  await sql`insert into squads (user_id, gameweek_id, bank, free_transfers) values (${u.id}, ${L.gws[0].id}, 0, 1)`;
  return u.id;
}
function fakeSend(blocked: number[] = []): Send & { sent: { chatId: number; text: string }[] } {
  const sent: { chatId: number; text: string }[] = [];
  const send = (async (chatId: number, text: string) => {
    if (blocked.includes(chatId)) return { ok: false, status: 403 };
    sent.push({ chatId, text });
    return { ok: true, status: 200 };
  }) as Send & { sent: typeof sent };
  send.sent = sent;
  return send;
}

describe('dueReminders', () => {
  it('окна: за 24 ч — напоминание за сутки, за 1 ч — за 2 часа, после дедлайна — ничего; отправленное не повторяется', async () => {
    const d = L.gws[1].deadline;
    const at = (h: number) => new Date(d.getTime() + h * H);
    const kinds = async (h: number) => (await dueReminders(sql, L.seasonId, at(h))).filter((r) => r.number === 2).map((r) => r.kind);
    expect(await kinds(-25)).toEqual([]);
    expect(await kinds(-23)).toEqual(['deadline_24h']);
    expect(await kinds(-1)).toEqual(['deadline_2h']);
    expect(await kinds(1 / 60)).toEqual([]);
    await sql`insert into notifications_sent (gameweek_id, kind) values (${L.gws[1].id}, 'deadline_2h')`;
    expect(await kinds(-1)).toEqual([]);
  });
});

describe('sendNotification', () => {
  it('язык по пользователю, выключенные пропускаются, 403 выключает уведомления, повтор — null', async () => {
    await user(101, 'ru');
    await user(102, 'kk', { enabled: false });
    const blocked = await user(103, 'kk');
    const send = fakeSend([103]);
    const n = { gameweekId: L.gws[1].id, number: 2, kind: 'deadline_24h' as const, deadline: new Date('2026-03-14T09:00:00Z') };
    expect(await sendNotification(sql, send, n)).toEqual({ sent: 1, failed: 1 });
    expect(send.sent).toEqual([{ chatId: 101, text: '⏰ 2-й тур: дедлайн 14.03 в 14:00, меньше суток. Проверьте состав и капитана.' }]);
    const [u] = await sql`select notify from users where id = ${blocked}`;
    expect(u.notify).toEqual({ enabled: false, blocked: true });
    expect(await sendNotification(sql, send, n)).toBeNull();
    expect(send.sent).toHaveLength(1);
  });

  it('итоги тура: очки с учётом штрафа, место и число участников', async () => {
    const a = await user(201, 'ru');
    const b = await user(202, 'kk');
    await sql`insert into gameweek_scores (user_id, gameweek_id, points, penalty, season_total, rank)
      values (${a}, ${L.gws[0].id}, 40, -4, 36, 2), (${b}, ${L.gws[0].id}, 50, 0, 50, 1)`;
    const send = fakeSend();
    await sendNotification(sql, send, { gameweekId: L.gws[0].id, number: 1, kind: 'results' });
    expect(send.sent).toEqual(expect.arrayContaining([
      { chatId: 201, text: '🏁 1-й тур сыгран: 36 очк. В общем зачёте — 2-е место из 2.' },
      { chatId: 202, text: '🏁 1-тур аяқталды: 50 ұпай. Жалпы кестеде 2 ішінен 1-орын.' }
    ]));
  });
});

describe('отказ Telegram', () => {
  it('не нажимал Start — уведомления не выключаем; заблокировал бота — выключаем', async () => {
    const never = await user(301, 'ru');
    const blocked = await user(302, 'ru');
    const send: Send = async (chatId) =>
      chatId === 301
        ? { ok: false, status: 403, description: "Forbidden: bot can't initiate conversation with a user" }
        : { ok: false, status: 403, description: 'Forbidden: bot was blocked by the user' };
    await sendNotification(sql, send, { gameweekId: L.gws[1].id, number: 2, kind: 'deadline_2h', deadline: new Date() });
    const rows = await sql`select id, notify from users where id in (${never}, ${blocked})`;
    expect(rows.find((r) => r.id === never)!.notify).toEqual({});
    expect(rows.find((r) => r.id === blocked)!.notify).toEqual({ enabled: false, blocked: true });
  });
});

describe('telegramSender', () => {
  it('sendMessage с кнопкой «Ойнау», открывающей мини-приложение', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return calls.length === 1
        ? new Response('{"ok":true}', { status: 200 })
        : new Response('{"ok":false,"description":"Forbidden: bot was blocked by the user"}', { status: 403 });
    }) as typeof fetch;
    const send = telegramSender('123:ABC', 'https://qpl.pages.dev', fetchImpl, async () => {});
    expect(await send(7, 'привет')).toEqual({ ok: true, status: 200 });
    expect(await send(8, 'привет')).toEqual({ ok: false, status: 403, description: 'Forbidden: bot was blocked by the user' });
    expect(calls[0]).toEqual({
      url: 'https://api.telegram.org/bot123:ABC/sendMessage',
      body: { chat_id: 7, text: 'привет', reply_markup: { inline_keyboard: [[{ text: 'Ойнау', web_app: { url: 'https://qpl.pages.dev' } }]] } }
    });
  });

  it('зависший Telegram: отправка прерывается по тайм-ауту', async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
    const send = telegramSender('1:x', 'https://a', hang, async () => {}, 20);
    expect(await send(1, 'x')).toEqual({ ok: false, status: 0 });
  });
});

