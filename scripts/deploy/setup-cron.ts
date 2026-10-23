// Кестені қосады: pg_cron 15 минут сайын cron-tick функциясын pg_net арқылы шақырады.
// Құпия (CRON_SECRET) функция құпияларына және Vault-қа жазылады; SQL мәтінінде де, экранда да болмайды.
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { envOpts, literal, managementFetch, runQuery } from './management.js';

export const JOB = 'qpl-cron-tick';
export const SCHEDULE = '*/15 * * * *';
const VAULT_NAME = 'qpl_cron_secret';

export function buildCronSql(projectRef: string): string {
  const url = `https://${projectRef}.supabase.co/functions/v1/cron-tick`;
  return `create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = '${JOB}';
select cron.schedule('${JOB}', '${SCHEDULE}', $job$
  select net.http_post(
    url := '${url}',
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = '${VAULT_NAME}')),
    timeout_milliseconds := 140000
  )
$job$);`;
}

export function vaultSql(value: string): string {
  return `select case
    when exists (select 1 from vault.secrets where name = '${VAULT_NAME}')
      then (select vault.update_secret(id, ${literal(value)}) from vault.secrets where name = '${VAULT_NAME}')::text
    else vault.create_secret(${literal(value)}, '${VAULT_NAME}')::text end as ok`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = envOpts();
  const cronSecret = process.env.CRON_SECRET || randomBytes(32).toString('hex');
  const appUrl = process.env.APP_URL || 'https://qpl-fantasy.pages.dev';
  await managementFetch(opts, '/secrets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([{ name: 'CRON_SECRET', value: cronSecret }, { name: 'APP_URL', value: appUrl }])
  }, 'секреты');
  console.log('Секреты заданы: CRON_SECRET, APP_URL');
  await runQuery(opts, vaultSql(cronSecret), 'Vault');
  await runQuery(opts, buildCronSql(opts.projectRef), 'расписание');
  console.log(`Расписание ${JOB}: ${SCHEDULE}`);
}
