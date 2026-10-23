import { describe, expect, it } from 'vitest';
import { buildCronSql } from '../setup-cron.js';

describe('setup-cron', () => {
  it('расписание каждые 15 минут вызывает cron-tick с секретом из Vault, сам секрет в SQL не попадает', () => {
    const sql = buildCronSql('abc');
    expect(sql).toContain("'*/15 * * * *'");
    expect(sql).toContain('https://abc.supabase.co/functions/v1/cron-tick');
    expect(sql).toContain('qpl_cron_secret');
    expect(sql).toContain('create extension if not exists pg_net');
    expect(sql).toContain('create extension if not exists pg_cron');
    expect(sql).not.toMatch(/[0-9a-f]{64}/);
  });
});
