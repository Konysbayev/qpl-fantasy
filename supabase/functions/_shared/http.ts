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
