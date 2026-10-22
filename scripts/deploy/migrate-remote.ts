// supabase/migrations/*.sql файлдарын бұлттағы базаға Management API арқылы ретімен қолданады; есеп schema_migrations кестесінде.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { envOpts, literal, runQuery, type ManagementOpts } from './management.js';

export async function migrateRemote(opts: ManagementOpts & { dir: string }): Promise<string[]> {
  await runQuery(opts, 'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())', 'schema_migrations');
  const done = new Set((await runQuery<{ name: string }>(opts, 'select name from schema_migrations', 'schema_migrations')).map((r) => r.name));
  const files = fs.readdirSync(opts.dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const body = fs.readFileSync(path.join(opts.dir, name), 'utf-8');
    // Миграция мен оның есебі бір транзакцияда: не толық, не мүлдем
    await runQuery(opts, `begin;\n${body}\n;\ninsert into schema_migrations (name) values (${literal(name)});\ncommit;`, `миграция ${name}`);
    applied.push(name);
  }
  return applied;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = path.join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
  const applied = await migrateRemote({ ...envOpts(), dir });
  console.log(applied.length > 0 ? `Применены: ${applied.join(', ')}` : 'Новых миграций нет');
}
