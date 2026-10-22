// Тесттік база: әр тест файлы өз базасын қайта жасайды, Supabase-тегі auth пен рөлдерге ұқсас бітеме қояды.
import path from 'node:path';
import postgres from 'postgres';
import { applyMigrations } from '../src/migrate.js';

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
export const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', '..', '..', 'supabase', 'migrations');

export async function freshDb(name: string): Promise<postgres.Sql> {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${name} with (force)`);
  await admin.unsafe(`create database ${name}`);
  await admin.unsafe(`do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql.unsafe(`create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;`);
  await applyMigrations(sql, MIGRATIONS_DIR);
  return sql;
}

// Сұрауды берілген рөлмен және пайдаланушымен транзакция ішінде орындайды
export async function asRole<T>(sql: postgres.Sql, role: 'anon' | 'authenticated', authId: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    if (authId) await tx`select set_config('request.jwt.claim.sub', ${authId}, true)`;
    return fn(tx);
  })) as T;
}
