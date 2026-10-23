import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hitRateLimit } from '../src/rate-limit.js';
import { freshDb } from './helpers.js';

let sql: postgres.Sql;
beforeAll(async () => {
  sql = await freshDb('qpl_test_rate_limit');
});
afterAll(async () => {
  await sql?.end();
});

describe('hitRateLimit', () => {
  it('в пределах лимита — разрешено, сверх лимита в той же минуте — нет, в следующей минуте снова можно', async () => {
    const t = new Date('2026-10-22T12:00:10Z');
    for (let i = 0; i < 3; i++) expect(await hitRateLimit(sql, 'u1:transfer', t, 3)).toBe(true);
    expect(await hitRateLimit(sql, 'u1:transfer', t, 3)).toBe(false);
    expect(await hitRateLimit(sql, 'u2:transfer', t, 3)).toBe(true);
    expect(await hitRateLimit(sql, 'u1:transfer', new Date('2026-10-22T12:01:00Z'), 3)).toBe(true);
  });

  it('таблица счётчиков закрыта от anon и authenticated', async () => {
    const rows = await sql`select has_table_privilege('anon', 'rate_limits', 'select') as anon, has_table_privilege('authenticated', 'rate_limits', 'insert') as auth`;
    expect(rows[0]).toEqual({ anon: false, auth: false });
  });
});
