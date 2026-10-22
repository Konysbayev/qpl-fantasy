// Бұлттағы базаның апта сайынғы көшірмесі (спецификация 8): әр кесте — жеке JSON. Тек оқу құқығы жеткілікті.
// Іске қосу: npm run deploy:backup → backups/<күні>/ (git-ке кірмейді)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { envOpts, runQuery, type ManagementOpts } from './management.js';

// source_raw (сайттың шикі беттері) үлкен және қайта жүктеледі — көшірмеге кірмейді
export const BACKUP_TABLES = [
  'seasons', 'clubs', 'players', 'gameweeks', 'fixtures', 'player_match_stats', 'users', 'squads', 'squad_picks',
  'transfers', 'transfer_requests', 'leagues', 'league_members', 'gameweek_scores', 'audit_log', 'source_usage', 'source_skip', 'schema_migrations'
] as const;

export async function backupRemote(opts: ManagementOpts, dir: string): Promise<Record<string, number>> {
  fs.mkdirSync(dir, { recursive: true });
  const summary: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const [res] = await runQuery<{ rows: unknown[] | null }>(opts, `select coalesce(json_agg(t), '[]'::json) as rows from "${table}" t`, `копия ${table}`);
    const rows = res?.rows ?? [];
    fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows));
    summary[table] = rows.length;
  }
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = path.join('backups', new Date().toISOString().slice(0, 10));
  const summary = await backupRemote(envOpts(), dir);
  console.log(`Копия в ${dir}:`, summary);
}
