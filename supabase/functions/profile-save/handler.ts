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
  const rawTeam = body?.teamName;
  if (lang === undefined && notify === undefined && rawTeam === undefined) return badRequest();
  if (lang !== undefined && lang !== 'kk' && lang !== 'ru') return badRequest();
  if (notify !== undefined && typeof notify !== 'boolean') return badRequest();
  let teamName: string | undefined;
  if (rawTeam !== undefined) {
    if (typeof rawTeam !== 'string') return badRequest();
    teamName = rawTeam.trim();
    // Рейтингте бір жолға сыятын атау: 3–24 таңба, басқару таңбаларынсыз
    if ([...teamName].length < 3 || [...teamName].length > 24 || /[\u0000-\u001f\u007f]/.test(teamName)) return badRequest();
  }
  return json({ ok: true, value: await saveProfile(deps.sql, session.sub, { lang, notify, teamName }) });
}
