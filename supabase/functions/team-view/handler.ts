// «Менің командам» деректері: тек өз құрамы.
import { hitRateLimit } from '../../../packages/db/src/rate-limit.js';
import { loadTeamView } from '../../../packages/db/src/team-view.js';
import { json, preflight, requireSession, unauthorized, LIMITS, tooMany, type FnDeps } from '../_shared/http.js';

export async function teamView(req: Request, deps: FnDeps): Promise<Response> {
  const pre = preflight(req);
  if (pre) return pre;
  const session = await requireSession(req, deps.sessionSecret, deps.nowSec);
  if (!session) return unauthorized();
  if (!(await hitRateLimit(deps.sql, `${session.sub}:team-view`, new Date(deps.nowSec * 1000), LIMITS['team-view']))) return tooMany();
  return json(await loadTeamView(deps.sql, session.sub, new Date(deps.nowSec * 1000)));
}
