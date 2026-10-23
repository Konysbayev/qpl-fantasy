// Жариялауды тексеру: сервер уақыты, базаға қосылу және құпиялардың бар-жоғы (мәндері көрсетілмейді).
import type postgres from 'postgres';
import { json } from '../_shared/http.js';

export async function health(deps: { sql: postgres.Sql; secrets: Record<string, string | undefined>; now: Date }): Promise<Response> {
  let db = false;
  try {
    await deps.sql.unsafe('select 1');
    db = true;
  } catch {
    db = false;
  }
  const secrets = Object.fromEntries(Object.entries(deps.secrets).map(([k, v]) => [k, Boolean(v)]));
  const ok = db && Object.values(secrets).every(Boolean);
  return json({ ok, time: deps.now.toISOString(), db, secrets }, ok ? 200 : 503);
}
