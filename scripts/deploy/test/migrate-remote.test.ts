import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateRemote } from '../migrate-remote.js';

const TOKEN = 'sbp_secret_token_123';

function migrationsDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

// Поддельный Management API: запоминает запросы, на выборку применённых отвечает списком
function fakeApi(applied: string[], fail?: { match: string; status: number; body: string }) {
  const calls: { url: string; auth: string | null; query: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const query = JSON.parse(String(init.body)).query as string;
    calls.push({ url, auth: new Headers(init.headers).get('authorization'), query });
    if (fail && query.includes(fail.match)) return new Response(fail.body, { status: fail.status });
    const rows = query.startsWith('select name from schema_migrations') ? applied.map((name) => ({ name })) : [];
    return new Response(JSON.stringify(rows), { status: 201, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('migrateRemote', () => {
  let dir: string;
  beforeEach(() => {
    dir = migrationsDir({ '0002_b.sql': 'create table b ();', '0001_a.sql': 'create table a ();', '0003_c.sql': "insert into t values ('x');", 'notes.txt': 'не миграция' });
  });

  it('применяет только новые файлы по порядку, уже применённые пропускает', async () => {
    const api = fakeApi(['0001_a.sql']);
    const applied = await migrateRemote({ projectRef: 'abc', token: TOKEN, fetchImpl: api.fetchImpl, dir });
    expect(applied).toEqual(['0002_b.sql', '0003_c.sql']);
    const bodies = api.calls.map((c) => c.query);
    expect(bodies.some((q) => q.includes('create table a'))).toBe(false);
    expect(bodies.findIndex((q) => q.includes('create table b'))).toBeLessThan(bodies.findIndex((q) => q.includes("insert into t values ('x')")));
  });

  it('каждая миграция и её учёт в schema_migrations — один запрос в транзакции', async () => {
    const api = fakeApi([]);
    await migrateRemote({ projectRef: 'abc', token: TOKEN, fetchImpl: api.fetchImpl, dir });
    const q = api.calls.find((c) => c.query.includes('create table b'))!.query;
    expect(q.startsWith('begin;')).toBe(true);
    expect(q).toContain("insert into schema_migrations (name) values ('0002_b.sql');");
    expect(q.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('шлёт запросы на database/query проекта с токеном', async () => {
    const api = fakeApi(['0001_a.sql', '0002_b.sql', '0003_c.sql']);
    const applied = await migrateRemote({ projectRef: 'abc', token: TOKEN, fetchImpl: api.fetchImpl, dir });
    expect(applied).toEqual([]);
    expect(api.calls[0].url).toBe('https://api.supabase.com/v1/projects/abc/database/query');
    expect(api.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('таблица учёта миграций закрыта от anon и authenticated (RLS), иначе её видно через публичный ключ', async () => {
    const api = fakeApi([]);
    await migrateRemote({ projectRef: 'abc', token: TOKEN, fetchImpl: api.fetchImpl, dir });
    const q = api.calls[0].query;
    expect(q).toContain('create table if not exists schema_migrations');
    expect(q).toContain('alter table schema_migrations enable row level security');
    expect(q).toContain('revoke all on schema_migrations from anon, authenticated');
  });

  it('HTTP-ошибка → исключение с текстом ответа, без токена в сообщении', async () => {
    const api = fakeApi([], { match: 'create table b', status: 400, body: `{"message":"syntax error at or near \\"b\\" (token ${TOKEN.slice(0, 3)})"}` });
    const err = await migrateRemote({ projectRef: 'abc', token: TOKEN, fetchImpl: api.fetchImpl, dir }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('syntax error');
    expect((err as Error).message).toContain('0002_b.sql');
    expect((err as Error).message).not.toContain(TOKEN);
  });
});
