import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from '../../../packages/db/test/helpers.js';
import { health } from '../health/handler.js';

let sql: postgres.Sql;
beforeAll(async () => {
  sql = await freshDb('qpl_test_fn_health');
});
afterAll(async () => {
  await sql?.end();
});

describe('health', () => {
  it('проверяет базу и наличие секретов, не раскрывая их', async () => {
    const res = await health({ sql, secrets: { TELEGRAM_BOT_TOKEN: 'x', SESSION_SECRET: 'y' }, now: new Date('2026-10-22T12:00:00Z') });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, time: '2026-10-22T12:00:00.000Z', db: true, secrets: { TELEGRAM_BOT_TOKEN: true, SESSION_SECRET: true } });
  });

  it('нет секрета или база недоступна → ok:false и 503', async () => {
    const broken = { unsafe: async () => { throw new Error('connection refused'); } } as unknown as postgres.Sql;
    const res = await health({ sql: broken, secrets: { TELEGRAM_BOT_TOKEN: undefined, SESSION_SECRET: 'y' }, now: new Date() });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: false, secrets: { TELEGRAM_BOT_TOKEN: false, SESSION_SECRET: true } });
  });
});
