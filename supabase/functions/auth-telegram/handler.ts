// Telegram initData → пайдаланушы → сессия токені.
import type postgres from 'postgres';
import { signSession, verifyInitData } from '../../../packages/auth/src/telegram.js';
import { upsertTelegramUser } from '../../../packages/db/src/users.js';
import { json, preflight, readJson } from '../_shared/http.js';

export interface AuthDeps {
  sql: postgres.Sql;
  botToken: string;
  sessionSecret: string;
  nowSec: number;
}

export async function authTelegram(req: Request, deps: AuthDeps): Promise<Response> {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await readJson(req);
  if (typeof body?.initData !== 'string' || body.initData === '') return json({ error: 'bad_request' }, 400);

  const tg = await verifyInitData(body.initData, deps.botToken, deps.nowSec);
  if (!tg) return json({ error: 'invalid_init_data' }, 401);
  const user = await upsertTelegramUser(deps.sql, tg);
  const token = await signSession({ sub: user.id, tg: tg.id }, deps.sessionSecret, deps.nowSec);
  return json({ token, user });
}
