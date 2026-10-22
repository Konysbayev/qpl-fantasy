// «Менің командам» деректері: тек өз құрамы.
import { loadTeamView } from '../../../packages/db/src/team-view.js';
import { json, preflight, requireSession, unauthorized, type FnDeps } from '../_shared/http.js';

export async function teamView(req: Request, deps: FnDeps): Promise<Response> {
  const pre = preflight(req);
  if (pre) return pre;
  const session = await requireSession(req, deps.sessionSecret, deps.nowSec);
  if (!session) return unauthorized();
  return json(await loadTeamView(deps.sql, session.sub, new Date(deps.nowSec * 1000)));
}
