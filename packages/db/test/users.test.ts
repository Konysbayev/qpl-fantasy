import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertTelegramUser } from '../src/users.js';
import { freshDb } from './helpers.js';

let sql: postgres.Sql;
beforeAll(async () => {
  sql = await freshDb('qpl_test_users');
});
afterAll(async () => {
  await sql?.end();
});

describe('upsertTelegramUser', () => {
  it('новый пользователь: имя из Telegram, язык ru → русский', async () => {
    const u = await upsertTelegramUser(sql, { id: 501, first_name: 'Нұрлан', last_name: 'Б.', language_code: 'ru' });
    expect(u).toMatchObject({ displayName: 'Нұрлан Б.', lang: 'ru' });
    const [row] = await sql`select telegram_id, display_name, lang from users where id = ${u.id}`;
    expect(row).toMatchObject({ telegram_id: '501', display_name: 'Нұрлан Б.', lang: 'ru' });
  });

  it('язык kk, en или нет → казахский', async () => {
    expect((await upsertTelegramUser(sql, { id: 502, first_name: 'A', language_code: 'en' })).lang).toBe('kk');
    expect((await upsertTelegramUser(sql, { id: 503, first_name: 'B' })).lang).toBe('kk');
  });

  it('повторный вход обновляет имя, но не создаёт второго и не меняет выбранный язык', async () => {
    const first = await upsertTelegramUser(sql, { id: 504, first_name: 'Old', language_code: 'ru' });
    await sql`update users set lang = 'kk' where id = ${first.id}`;
    const again = await upsertTelegramUser(sql, { id: 504, first_name: 'New', username: 'nn', language_code: 'ru' });
    expect(again).toEqual({ id: first.id, displayName: 'New', lang: 'kk' });
    expect((await sql`select count(*)::int as n from users where telegram_id = 504`)[0].n).toBe(1);
  });

  it('нет имени → логин', async () => {
    expect((await upsertTelegramUser(sql, { id: 505, first_name: ' ', username: 'qpl_fan' })).displayName).toBe('qpl_fan');
  });
});
