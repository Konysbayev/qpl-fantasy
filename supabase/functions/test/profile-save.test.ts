import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '../../../packages/auth/src/telegram.js';
import { freshDb } from '../../../packages/db/test/helpers.js';
import { profileSave } from '../profile-save/handler.js';

const SECRET = 'fn-profile-secret';
const NOW = 1_800_000_000;
let sql: postgres.Sql;
let user: string;
let token: string;

beforeAll(async () => {
  sql = await freshDb('qpl_test_fn_profile');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  await sql`truncate users, rate_limits cascade`;
  const [u] = await sql`insert into users (telegram_id, display_name, lang) values (77, 'Т', 'kk') returning id`;
  user = u.id;
  token = await signSession({ sub: user, tg: 77 }, SECRET, NOW);
});

const req = (body: unknown, auth: string | null = token) =>
  new Request('https://x/functions/v1/profile-save', { method: 'POST', headers: auth ? { authorization: `Bearer ${auth}` } : {}, body: JSON.stringify(body) });
const deps = () => ({ sql, sessionSecret: SECRET, nowSec: NOW });

describe('profile-save', () => {
  it('сохраняет язык и уведомления', async () => {
    const res = await profileSave(req({ lang: 'ru', notify: false }), deps());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, value: { lang: 'ru', notify: false } });
  });

  it('без сессии → 401; неверные значения или пустое тело → 400', async () => {
    expect((await profileSave(req({ lang: 'ru' }, null), deps())).status).toBe(401);
    expect((await profileSave(req({ lang: 'en' }), deps())).status).toBe(400);
    expect((await profileSave(req({ notify: 'yes' }), deps())).status).toBe(400);
    expect((await profileSave(req({}), deps())).status).toBe(400);
  });

  it('больше 20 запросов в минуту → 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await profileSave(req({ notify: true }), deps())).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
