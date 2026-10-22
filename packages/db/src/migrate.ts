// supabase/migrations/*.sql файлдарын ретімен қолданады (жергілікті база мен тесттер үшін; өндірісте — Supabase CLI).
import fs from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';

export async function applyMigrations(sql: postgres.Sql, dir: string): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const body = fs.readFileSync(path.join(dir, name), 'utf-8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    applied.push(name);
  }
  return applied;
}
