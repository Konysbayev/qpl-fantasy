// Құрамды сақтау: алғашқы құрам жасалады, бар болса — негізгі 11, қосалқылар реті, капитан мен вице.
import { hitRateLimit } from '../../../packages/db/src/rate-limit.js';
import { createFirstSquad, saveLineup, userHasSquad } from '../../../packages/db/src/squad.js';
import { badRequest, parsePicks, preflight, readJson, requireSession, result, unauthorized, LIMITS, tooMany, type FnDeps } from '../_shared/http.js';

export async function squadSave(req: Request, deps: FnDeps): Promise<Response> {
  const pre = preflight(req);
  if (pre) return pre;
  const session = await requireSession(req, deps.sessionSecret, deps.nowSec);
  if (!session) return unauthorized();
  if (!(await hitRateLimit(deps.sql, `${session.sub}:squad-save`, new Date(deps.nowSec * 1000), LIMITS['squad-save']))) return tooMany();
  const body = await readJson(req);
  const picks = parsePicks(body?.picks);
  if (!picks || !Number.isInteger(body?.gameweek)) return badRequest();

  const now = new Date(deps.nowSec * 1000);
  const gameweek = body!.gameweek as number;
  if (!(await userHasSquad(deps.sql, session.sub))) return result(await createFirstSquad(deps.sql, session.sub, now, picks, gameweek));
  return result(await saveLineup(deps.sql, session.sub, now, picks, gameweek));
}
