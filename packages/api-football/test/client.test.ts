import { describe, expect, it } from 'vitest';
import { createApiFootballClient } from '../src/client.js';

// Поддельный fetch: запоминает запросы и отвечает заданным статусом и телом
function fakeFetch(calls: Request[], status: number, body: unknown): typeof fetch {
  return async (input, init) => {
    calls.push(new Request(input as string, init));
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
}

describe('createApiFootballClient', () => {
  it('шлёт ключ в заголовке и собирает адрес с параметрами', async () => {
    const calls: Request[] = [];
    const client = createApiFootballClient({ apiKey: 'SECRET', fetchImpl: fakeFetch(calls, 200, { errors: [], results: 1, response: [{ a: 1 }] }) });
    const r = await client.get('/fixtures', { league: 389, season: 2026 });
    expect(calls[0].url).toBe('https://v3.football.api-sports.io/fixtures?league=389&season=2026');
    expect(calls[0].headers.get('x-apisports-key')).toBe('SECRET');
    expect(r).toMatchObject({ ok: true, results: 1, response: [{ a: 1 }] });
    expect(client.requestCount()).toBe(1);
  });

  it('через RapidAPI: другой адрес и заголовки x-rapidapi-key / x-rapidapi-host', async () => {
    const calls: Request[] = [];
    const client = createApiFootballClient({ apiKey: 'RKEY', provider: 'rapidapi', fetchImpl: fakeFetch(calls, 200, { errors: [], results: 0, response: [] }) });
    await client.get('/status');
    expect(calls[0].url).toBe('https://api-football-v1.p.rapidapi.com/v3/status');
    expect(calls[0].headers.get('x-rapidapi-key')).toBe('RKEY');
    expect(calls[0].headers.get('x-rapidapi-host')).toBe('api-football-v1.p.rapidapi.com');
    expect(calls[0].headers.get('x-apisports-key')).toBeNull();
  });

  it('без ключа заголовок не отправляется (ключ подставляет среда)', async () => {
    const calls: Request[] = [];
    const client = createApiFootballClient({ apiKey: '', fetchImpl: fakeFetch(calls, 200, { errors: [], results: 0, response: [] }) });
    await client.get('/status');
    expect(calls[0].headers.has('x-apisports-key')).toBe(false);
  });

  it('пустые errors в виде [] и {} считаются успехом', async () => {
    for (const errors of [[], {}]) {
      const client = createApiFootballClient({ apiKey: 'K', fetchImpl: fakeFetch([], 200, { errors, results: 0, response: [] }) });
      expect(await client.get('/status')).toMatchObject({ ok: true, results: 0 });
    }
  });

  it('ошибка тарифа из errors-объекта', async () => {
    const body = { errors: { plan: 'Free plans do not have access to this season, try from 2021 to 2023.' }, results: 0, response: [] };
    const client = createApiFootballClient({ apiKey: 'K', fetchImpl: fakeFetch([], 200, body) });
    const r = await client.get('/fixtures', { league: 389, season: 2026 });
    expect(r).toMatchObject({
      ok: false,
      kind: 'api',
      errorKey: 'plan',
      message: 'plan: Free plans do not have access to this season, try from 2021 to 2023.'
    });
  });

  it('лимит запросов: errors.rateLimit и HTTP 429', async () => {
    const apiLimit = createApiFootballClient({
      apiKey: 'K',
      fetchImpl: fakeFetch([], 200, { errors: { rateLimit: 'Too many requests. Your rate limit is 10 requests per minute.' }, results: 0, response: [] })
    });
    expect(await apiLimit.get('/status')).toMatchObject({ ok: false, kind: 'api', errorKey: 'rateLimit' });

    const httpLimit = createApiFootballClient({ apiKey: 'K', fetchImpl: fakeFetch([], 429, 'Too Many Requests') });
    expect(await httpLimit.get('/status')).toMatchObject({ ok: false, kind: 'http', status: 429 });
  });

  it('сетевая ошибка не роняет программу', async () => {
    const client = createApiFootballClient({
      apiKey: 'K',
      fetchImpl: async () => { throw new TypeError('fetch failed'); }
    });
    const r = await client.get('/status');
    expect(r).toMatchObject({ ok: false, kind: 'network' });
    expect(client.requestCount()).toBe(1);
  });

  it('ключ не попадает в текст ошибки', async () => {
    const network = createApiFootballClient({
      apiKey: 'SECRET',
      fetchImpl: async () => { throw new Error('connect failed for key SECRET'); }
    });
    expect(JSON.stringify(await network.get('/status'))).not.toContain('SECRET');

    const http = createApiFootballClient({ apiKey: 'SECRET', fetchImpl: fakeFetch([], 500, 'internal error, key=SECRET') });
    expect(JSON.stringify(await http.get('/status'))).not.toContain('SECRET');
  });
});
