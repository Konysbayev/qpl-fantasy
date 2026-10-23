import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { saveProfile, upsertTelegramUser } from '../src/users.js';
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
    expect(again).toEqual({ id: first.id, displayName: 'New', lang: 'kk', notify: true, teamName: null });
    expect((await sql`select count(*)::int as n from users where telegram_id = 504`)[0].n).toBe(1);
  });

  it('нет имени → логин', async () => {
    expect((await upsertTelegramUser(sql, { id: 505, first_name: ' ', username: 'qpl_fan' })).displayName).toBe('qpl_fan');
  });
});

describe('saveProfile', () => {
  it('меняет язык и уведомления; включение снимает отметку «бот заблокирован»', async () => {
    const u = await upsertTelegramUser(sql, { id: 601, first_name: 'А', language_code: 'ru' });
    expect(await saveProfile(sql, u.id, { notify: false })).toEqual({ lang: 'ru', notify: false, teamName: null });
    expect((await upsertTelegramUser(sql, { id: 601, first_name: 'А' })).notify).toBe(false);
    expect(await saveProfile(sql, u.id, { lang: 'kk' })).toEqual({ lang: 'kk', notify: false, teamName: null });
    await sql`update users set notify = '{"enabled": false, "blocked": true}' where id = ${u.id}`;
    expect(await saveProfile(sql, u.id, { notify: true })).toEqual({ lang: 'kk', notify: true, teamName: null });
    const [row] = await sql`select notify from users where id = ${u.id}`;
    expect(row.notify).toEqual({ enabled: true });
  });
});

describe('название команды', () => {
  it('сохраняется с обрезкой пробелов и приходит при входе', async () => {
    const u = await upsertTelegramUser(sql, { id: 701, first_name: 'А' });
    expect(await saveProfile(sql, u.id, { teamName: '  Сарыарқа FC ' })).toMatchObject({ teamName: 'Сарыарқа FC' });
    expect((await upsertTelegramUser(sql, { id: 701, first_name: 'А' })).teamName).toBe('Сарыарқа FC');
  });

  it('база не принимает слишком короткое или длинное название', async () => {
    const u = await upsertTelegramUser(sql, { id: 702, first_name: 'Б' });
    await expect(sql`update users set team_name = 'аб' where id = ${u.id}`).rejects.toThrow(/check/i);
    await expect(sql`update users set team_name = ${'я'.repeat(25)} where id = ${u.id}`).rejects.toThrow(/check/i);
  });
});
