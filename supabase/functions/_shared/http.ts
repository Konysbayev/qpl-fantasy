// Функциялардың ортақ HTTP бөлігі: CORS, JSON жауап, сессияны тексеру.
import { verifySession, type SessionPayload } from '../../../packages/auth/src/telegram.js';

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info'
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response(null, { status: 204, headers: CORS }) : null;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Authorization: Bearer <сессия>; жарамсыз не мерзімі өткен болса — null
export async function requireSession(req: Request, secret: string, nowSec: number): Promise<SessionPayload | null> {
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '');
  return m ? verifySession(m[1], secret, nowSec) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isUuidList = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 15 && v.every(isUuid);

export interface FnDeps {
  sql: import('postgres').Sql;
  sessionSecret: string;
  nowSec: number;
}

export interface PickBody {
  playerId: string;
  slot: number;
  isCaptain: boolean;
  isVice: boolean;
}

export function parsePicks(v: unknown): PickBody[] | null {
  if (!Array.isArray(v) || v.length !== 15) return null;
  const ok = v.every((p) => p && isUuid(p.playerId) && Number.isInteger(p.slot) && typeof p.isCaptain === 'boolean' && typeof p.isVice === 'boolean');
  return ok ? v.map((p) => ({ playerId: p.playerId, slot: p.slot, isCaptain: p.isCaptain, isVice: p.isVice })) : null;
}

export function parseTransfer(b: Record<string, unknown> | null) {
  if (!b || !isUuid(b.requestId) || !Number.isInteger(b.gameweek) || !isUuidList(b.out) || !isUuidList(b.in) || typeof b.wildcard !== 'boolean') return null;
  return { requestId: b.requestId, gameweek: b.gameweek as number, out: b.out, in: b.in, wildcard: b.wildcard };
}

// Пән саласының қатесі — 409 және { ok: false, error }
export function result(r: { ok: boolean }): Response {
  return json(r, r.ok ? 200 : 409);
}

export const unauthorized = (): Response => json({ ok: false, error: 'unauthorized' }, 401);
export const badRequest = (): Response => json({ ok: false, error: 'bad_request' }, 400);
