// Трансфер(лер) бір транзакцияда: бюджет, клубтан 3, құрам, дедлайн, айыппұл, Wildcard; сол requestId қайталанса — бұрынғы жауап.
import { hitRateLimit } from '../../../packages/db/src/rate-limit.js';
import { commitTransfers } from '../../../packages/db/src/squad.js';
import { badRequest, parseTransfer, preflight, readJson, requireSession, result, unauthorized, LIMITS, tooMany, type FnDeps } from '../_shared/http.js';

export async function transferCommit(req: Request, deps: FnDeps): Promise<Response> {
  const pre = preflight(req);
  if (pre) return pre;
  const session = await requireSession(req, deps.sessionSecret, deps.nowSec);
  if (!session) return unauthorized();
  if (!(await hitRateLimit(deps.sql, `${session.sub}:transfer-commit`, new Date(deps.nowSec * 1000), LIMITS['transfer-commit']))) return tooMany();
  const body = parseTransfer(await readJson(req));
  if (!body) return badRequest();
  return result(await commitTransfers(deps.sql, session.sub, new Date(deps.nowSec * 1000), body));
}
