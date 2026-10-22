import { createHmac } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from '../../../packages/db/test/helpers.js';
import { verifySession } from '../../../packages/auth/src/telegram.js';
import { authTelegram } from '../auth-telegram/handler.js';

const BOT = '42:BOT';
const SECRET = 'test-session-secret';
const NOW = 1_761_130_000;

function initData(user: object, authDate = NOW - 10): string {
  const fields: Record<string, string> = { auth_date: String(authDate), user: JSON.stringify(user) };
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const hash = createHmac('sha256', createHmac('sha256', 'WebAppData').update(BOT).digest()).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

let sql: postgres.Sql;
beforeAll(async () => {
  sql = await freshDb('qpl_test_fn_auth');
});
afterAll(async () => {
  await sql?.end();
});

const call = (body: unknown, method = 'POST') =>
  authTelegram(new Request('https://x/functions/v1/auth-telegram', { method, body: method === 'POST' ? JSON.stringify(body) : undefined }), {
    sql, botToken: BOT, sessionSecret: SECRET, nowSec: NOW
  });

describe('auth-telegram', () => {
  it('верный initData → токен сессии и пользователь', async () => {
    const res = await call({ initData: initData({ id: 9001, first_name: 'Ая', language_code: 'ru' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json();
    expect(body.user).toMatchObject({ displayName: 'Ая', lang: 'ru' });
    expect(await verifySession(body.token, SECRET, NOW + 1)).toEqual({ sub: body.user.id, tg: 9001 });
  });

  it('поддельный или старый initData → 401 и пользователь не создаётся', async () => {
    const forged = initData({ id: 9002, first_name: 'X' }).replace('9002', '9003');
    expect((await call({ initData: forged })).status).toBe(401);
    expect((await call({ initData: initData({ id: 9004, first_name: 'Y' }, NOW - 90_000) })).status).toBe(401);
    expect((await sql`select count(*)::int as n from users where telegram_id in (9002, 9003, 9004)`)[0].n).toBe(0);
  });

  it('нет initData → 400; preflight OPTIONS → 204 с CORS', async () => {
    expect((await call({})).status).toBe(400);
    const pre = await call(null, 'OPTIONS');
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
  });
});
