import { describe, expect, it } from 'vitest';
import { ForbiddenPathError, RequestLimitError, USER_AGENT, createPoliteFetcher } from '../src/fetcher.js';

// Жалған уақыт: sleep сағатты алға жылжытады
function fakeClock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    tick: (ms: number) => {
      t += ms;
    },
    sleeps
  };
}

function okFetch(calls: Request[]): typeof fetch {
  return async (input, init) => {
    calls.push(new Request(input as string, init));
    return new Response('ok', { status: 200 });
  };
}

describe('createPoliteFetcher', () => {
  it('шлёт наш User-Agent на kffleague.kz', async () => {
    const calls: Request[] = [];
    const clock = fakeClock();
    const f = createPoliteFetcher({ fetchImpl: okFetch(calls), now: clock.now, sleep: clock.sleep });
    expect(await f.get('/ru/matches/993')).toEqual({ status: 200, body: 'ok' });
    expect(calls[0].url).toBe('https://kffleague.kz/ru/matches/993');
    expect(calls[0].headers.get('user-agent')).toBe(USER_AGENT);
  });

  it('держит паузу не меньше 3000 мс между запросами', async () => {
    const clock = fakeClock();
    const f = createPoliteFetcher({ fetchImpl: okFetch([]), now: clock.now, sleep: clock.sleep });
    await f.get('/a');
    clock.tick(1000);
    await f.get('/b');
    await f.get('/c');
    expect(clock.sleeps).toEqual([2000, 3000]);
    expect(f.requestCount()).toBe(3);
  });

  it('отказывается от /api/ и /_next/ без запроса в сеть', async () => {
    const calls: Request[] = [];
    const clock = fakeClock();
    const f = createPoliteFetcher({ fetchImpl: okFetch(calls), now: clock.now, sleep: clock.sleep });
    await expect(f.get('/api/v1/matches')).rejects.toThrow(ForbiddenPathError);
    await expect(f.get('/_next/static/x.js')).rejects.toThrow(ForbiddenPathError);
    await expect(f.get('/ru/../api/x')).rejects.toThrow(ForbiddenPathError);
    expect(calls).toHaveLength(0);
  });

  it('после maxRequests бросает RequestLimitError', async () => {
    const clock = fakeClock();
    const f = createPoliteFetcher({ fetchImpl: okFetch([]), now: clock.now, sleep: clock.sleep, maxRequests: 2 });
    await f.get('/a');
    await f.get('/b');
    await expect(f.get('/c')).rejects.toThrow(RequestLimitError);
  });

  it('сетевая ошибка → status 0 и текст ошибки, а не падение', async () => {
    const clock = fakeClock();
    const f = createPoliteFetcher({ fetchImpl: async () => { throw new TypeError('fetch failed'); }, now: clock.now, sleep: clock.sleep });
    expect(await f.get('/a')).toEqual({ status: 0, body: 'fetch failed' });
  });

  it('каждый запрос сообщается через onRequest', async () => {
    const clock = fakeClock();
    let n = 0;
    const f = createPoliteFetcher({ fetchImpl: okFetch([]), now: clock.now, sleep: clock.sleep, onRequest: () => { n++; } });
    await f.get('/a');
    await f.get('/b');
    expect(n).toBe(2);
  });

  it('зависший сайт: запрос прерывается по тайм-ауту и возвращает статус 0', async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
    const f = createPoliteFetcher({ fetchImpl: hang, timeoutMs: 20 });
    expect((await f.get('/ru/matches/1')).status).toBe(0);
  });
});

