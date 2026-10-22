// Telegram Mini App кіруі: initData қолтаңбасын тексеру және өз сессиямыз (HS256 JWT). Тек WebCrypto — Node мен Deno-да бірдей.

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface SessionPayload {
  sub: string;
  tg: number;
}

const DAY = 86_400;
const SESSION_TTL = 7 * DAY;
const enc = new TextEncoder();

async function hmacKey(key: BufferSource, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function hmac(key: BufferSource, data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(key, 'sign'), enc.encode(data)));
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
}

// Telegram құжаттамасы: secret = HMAC("WebAppData", bot_token), hash = HMAC(secret, data_check_string)
export async function verifyInitData(initData: string, botToken: string, nowSec: number, maxAgeSec: number = DAY): Promise<TelegramUser | null> {
  const params = new URLSearchParams(initData);
  const hash = fromHex(params.get('hash') ?? '');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');

  const secret = await hmac(enc.encode('WebAppData'), botToken);
  // Тұрақты уақытта салыстыру: verify хэшті өзі салыстырады
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), hash, enc.encode(check));
  if (!ok) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSec - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null;
    return user && typeof user.id === 'number' ? user : null;
  } catch {
    return null;
  }
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const HEADER = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

export async function signSession(payload: SessionPayload, secret: string, nowSec: number, ttlSec: number = SESSION_TTL): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ sub: payload.sub, tg: payload.tg, iat: nowSec, exp: nowSec + ttlSec })));
  const sig = await hmac(enc.encode(secret), `${HEADER}.${body}`);
  return `${HEADER}.${body}.${b64url(sig)}`;
}

export async function verifySession(token: string, secret: string, nowSec: number): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(enc.encode(secret), 'verify'), fromB64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))) as { sub?: unknown; tg?: unknown; exp?: unknown };
    if (typeof p.sub !== 'string' || typeof p.tg !== 'number' || typeof p.exp !== 'number' || nowSec >= p.exp) return null;
    return { sub: p.sub, tg: p.tg };
  } catch {
    return null;
  }
}
