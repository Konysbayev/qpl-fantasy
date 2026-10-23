// Профильді сақтау: тіл (kk/ru) және боттағы хабарламалар.
import { hitRateLimit } from '../../../packages/db/src/rate-limit.js';
import { saveProfile } from '../../../packages/db/src/users.js';
import { badRequest, json, preflight, readJson, requireSession, unauthorized, LIMITS, tooMany, type FnDeps } from '../_shared/http.js';

export async function profileSave(req: Request, deps: FnDeps): Promise<Response> {
  const pre = preflight(req);
  if (pre) return pre;
  const session = await requireSession(req, deps.sessionSecret, deps.nowSec);
  if (!session) return unauthorized();
  if (!(await hitRateLimit(deps.sql, `${session.sub}:profile-save`, new Date(deps.nowSec * 1000), LIMITS['profile-save']))) return tooMany();
  const body = await readJson(req);
  const lang = body?.lang;
  const notify = body?.notify;
  if (lang === undefined && notify === undefined) return badRequest();
  if (lang !== undefined && lang !== 'kk' && lang !== 'ru') return badRequest();
  if (notify !== undefined && typeof notify !== 'boolean') return badRequest();
  return json({ ok: true, value: await saveProfile(deps.sql, session.sub, { lang, notify }) });
}
