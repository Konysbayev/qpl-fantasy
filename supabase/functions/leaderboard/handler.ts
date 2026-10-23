// Жалпы рейтинг: GET ?offset=0&limit=50 (limit ≤ 100), сессиямен — өз жолы белгіленеді.
import { hitRateLimit } from '../../../packages/db/src/rate-limit.js';
import { loadLeaderboard } from '../../../packages/db/src/leaderboard.js';
import { badRequest, json, preflight, requireSession, unauthorized, LIMITS, tooMany, type FnDeps } from '../_shared/http.js';

function intParam(v: string | null, fallback: number, max: number): number | null {
  if (v === null) return fallback;
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n <= max ? n : null;
}

export async function leaderboard(req: Request, deps: FnDeps): Promise<Response> {
  const pre = preflight(req);
  if (pre) return pre;
  const session = await requireSession(req, deps.sessionSecret, deps.nowSec);
  if (!session) return unauthorized();
  if (!(await hitRateLimit(deps.sql, `${session.sub}:leaderboard`, new Date(deps.nowSec * 1000), LIMITS.leaderboard))) return tooMany();
  const url = new URL(req.url);
  const offset = intParam(url.searchParams.get('offset'), 0, 1_000_000);
  const limit = intParam(url.searchParams.get('limit'), 50, 100);
  if (offset === null || limit === null || limit === 0) return badRequest();
  return json(await loadLeaderboard(deps.sql, session.sub, { offset, limit }));
}
