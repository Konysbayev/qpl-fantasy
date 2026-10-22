import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signSession, verifyInitData, verifySession } from '../src/telegram.js';

const BOT = '123456:TEST-bot-token';
const NOW = 1_761_130_000;
const USER = { id: 777001, first_name: 'Нұрлан', last_name: 'Базарбаев', username: 'nurlan', language_code: 'ru' };

// initData собирается по документации Telegram, независимо от проверяемого кода
function initData(fields: Record<string, string>, bot = BOT): string {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(bot).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
const fields = (authDate = NOW - 60) => ({ query_id: 'AAH1', user: JSON.stringify(USER), auth_date: String(authDate) });

describe('verifyInitData', () => {
  it('верная подпись → пользователь Telegram', async () => {
    expect(await verifyInitData(initData(fields()), BOT, NOW)).toEqual(USER);
  });

  it('изменённое поле → null', async () => {
    const data = new URLSearchParams(initData(fields()));
    data.set('user', JSON.stringify({ ...USER, id: 1 }));
    expect(await verifyInitData(data.toString(), BOT, NOW)).toBeNull();
  });

  it('подпись старше 24 часов → null', async () => {
    expect(await verifyInitData(initData(fields(NOW - 86_401)), BOT, NOW)).toBeNull();
    expect(await verifyInitData(initData(fields(NOW - 86_399)), BOT, NOW)).not.toBeNull();
  });

  it('подписано чужим токеном бота → null', async () => {
    expect(await verifyInitData(initData(fields(), '999:OTHER'), BOT, NOW)).toBeNull();
  });

  it('нет hash или пользователя, мусор → null', async () => {
    expect(await verifyInitData('auth_date=1&user=%7B%7D', BOT, NOW)).toBeNull();
    expect(await verifyInitData('', BOT, NOW)).toBeNull();
    const noUser = { query_id: 'AAH1', auth_date: String(NOW) };
    expect(await verifyInitData(initData(noUser), BOT, NOW)).toBeNull();
  });
});

describe('sessions', () => {
  const SECRET = 'session-secret-for-tests-only';
  const payload = { sub: '6f1b2c3d-0000-4000-8000-000000000001', tg: 777001 };

  it('свой токен принимается', async () => {
    const token = await signSession(payload, SECRET, NOW);
    expect(token.split('.')).toHaveLength(3);
    expect(await verifySession(token, SECRET, NOW + 60)).toEqual(payload);
  });

  it('изменённый токен отклоняется', async () => {
    const token = await signSession(payload, SECRET, NOW);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, sub: 'someone-else', iat: NOW, exp: NOW + 604_800 })).toString('base64url');
    expect(await verifySession(`${h}.${forged}.${s}`, SECRET, NOW)).toBeNull();
    expect(await verifySession(token, 'other-secret', NOW)).toBeNull();
    expect(await verifySession('not.a.jwt', SECRET, NOW)).toBeNull();
  });

  it('просроченный отклоняется: срок 7 дней', async () => {
    const token = await signSession(payload, SECRET, NOW);
    expect(await verifySession(token, SECRET, NOW + 604_799)).toEqual(payload);
    expect(await verifySession(token, SECRET, NOW + 604_800)).toBeNull();
  });
});
