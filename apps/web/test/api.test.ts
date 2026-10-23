import { describe, expect, it } from 'vitest';
import { createApi } from '../src/api.js';

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Record<string, { status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const key = Object.keys(responses).find((k) => url.includes(k));
    const r = key ? responses[key] : { status: 404, body: { error: 'not_found' } };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const config = (fetchImpl: typeof fetch) => ({ supabaseUrl: 'https://ref.supabase.co', anonKey: 'anon-key', fetchImpl, initData: () => 'signed-init-data' });
const session = { token: 'session-token', user: { id: 'u1', displayName: 'Ая', lang: 'kk' } };

describe('api', () => {
  it('вход: initData уходит в auth-telegram, ответ — сессия', async () => {
    const f = fakeFetch({ 'auth-telegram': { status: 200, body: session } });
    const api = createApi(config(f.fetchImpl));
    expect(await api.login()).toEqual(session);
    expect(f.calls[0].url).toBe('https://ref.supabase.co/functions/v1/auth-telegram');
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ initData: 'signed-init-data' });
  });

  it('трансфер шлёт Authorization: Bearer <токен> и возвращает ошибку сервера как { ok:false, error }', async () => {
    const f = fakeFetch({ 'auth-telegram': { status: 200, body: session }, 'transfer-commit': { status: 409, body: { ok: false, error: 'deadline_passed' } } });
    const api = createApi(config(f.fetchImpl));
    await api.login();
    const r = await api.transfer({ requestId: 'r1', gameweek: 12, out: ['a'], in: ['b'], wildcard: false });
    expect(r).toEqual({ ok: false, error: 'deadline_passed' });
    const call = f.calls.find((c) => c.url.endsWith('/functions/v1/transfer-commit'))!;
    expect(new Headers(call.init.headers).get('authorization')).toBe('Bearer session-token');
    expect(call.init.method).toBe('POST');
  });

  it('публичные данные читаются из REST с anon-ключом', async () => {
    const f = fakeFetch({ '/rest/v1/clubs': { status: 200, body: [{ id: 'c1', name_ru: 'Кайрат', name_kz: 'Қайрат', code: 'ҚАЙ', logo_url: '/clubs/13.png', kit: null }] } });
    const api = createApi(config(f.fetchImpl));
    const clubs = await api.clubs();
    expect(clubs[0]).toMatchObject({ id: 'c1', code: 'ҚАЙ', nameKz: 'Қайрат', logoUrl: '/clubs/13.png' });
    expect(new Headers(f.calls[0].init.headers).get('apikey')).toBe('anon-key');
  });

  it('сессия истекла (401) — входит заново через initData и повторяет запрос один раз', async () => {
    let views = 0;
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url.replace('https://ref.supabase.co', ''));
      if (url.endsWith('/auth-telegram')) return new Response(JSON.stringify({ ...session, token: `t${calls.length}` }), { status: 200 });
      views++;
      return views === 1 ? new Response('{"ok":false,"error":"unauthorized"}', { status: 401 }) : new Response('{"picks":[]}', { status: 200 });
    }) as typeof fetch;
    const api = createApi(config(fetchImpl));
    await api.login();
    expect(await api.teamView()).toEqual({ picks: [] });
    expect(calls).toEqual(['/functions/v1/auth-telegram', '/functions/v1/team-view', '/functions/v1/auth-telegram', '/functions/v1/team-view']);
  });

  it('без входа или при 401 → ошибка unauthorized, а не исключение', async () => {
    const f = fakeFetch({ 'squad-save': { status: 401, body: { ok: false, error: 'unauthorized' } } });
    const api = createApi(config(f.fetchImpl));
    expect(await api.saveLineup({ gameweek: 1, picks: [] })).toEqual({ ok: false, error: 'unauthorized' });
  });
});
