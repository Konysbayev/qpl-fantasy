import { describe, expect, it } from 'vitest';
import { createApiFootballClient } from '../../../packages/api-football/src/client.js';
import type { FixtureEntry } from '../../../packages/api-football/src/types.js';
import { finishedFixture, kazLeagues } from '../../../packages/api-football/test/samples.js';
import { parseAllowedSeasons, runProbe } from '../probe.js';

const KEY = 'SECRET-KEY';
const ok = (response: unknown) => ({ errors: [], results: Array.isArray(response) ? response.length : 1, response, parameters: { key: KEY } });
const fail = (errors: Record<string, string>) => ({ errors, results: 0, response: [] });

const listItem = (id: number, date: string, status: string): FixtureEntry => ({
  fixture: { id, date, status: { short: status } },
  teams: finishedFixture.teams,
  goals: finishedFixture.goals
});
const detail = (id: number): FixtureEntry => ({ ...finishedFixture, fixture: { ...finishedFixture.fixture, id } });

// API жолдары → жауап денесі. Белгісіз жол — 404.
function routes(map: Record<string, unknown>): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    const route = url.pathname + url.search;
    if (!(route in map)) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(map[route]), { status: 200 });
  };
}

const baseRoutes = {
  '/status': ok({ account: { firstname: 'Nurlan', lastname: 'B', email: 'owner@example.com' }, subscription: { plan: 'Free' }, requests: { current: 3, limit_day: 100 } }),
  '/leagues?country=Kazakhstan': ok(kazLeagues),
  '/fixtures?league=389&season=2026': ok([
    listItem(1001, '2026-09-01T15:00:00+00:00', 'FT'),
    listItem(1002, '2026-09-08T15:00:00+00:00', 'FT'),
    listItem(1003, '2026-09-15T15:00:00+00:00', 'PEN'),
    listItem(1004, '2026-10-30T15:00:00+00:00', 'NS')
  ]),
  '/fixtures?id=1001': ok([detail(1001)]),
  '/fixtures?id=1002': ok([detail(1002)]),
  '/fixtures?id=1003': ok([detail(1003)]),
  '/fixtures/players?fixture=1001': ok(finishedFixture.players),
  '/fixtures/players?fixture=1002': ok(finishedFixture.players),
  '/fixtures/players?fixture=1003': ok(finishedFixture.players),
  '/fixtures?live=all': ok([{ ...listItem(2000, '2026-10-22T15:00:00+00:00', '1H'), league: { id: 389 } }])
};

function setup(map: Record<string, unknown>, maxRequests = 25) {
  const client = createApiFootballClient({ apiKey: KEY, fetchImpl: routes(map) });
  const raws: unknown[] = [];
  let waits = 0;
  const run = () =>
    runProbe(client, {
      targetSeason: 2026,
      maxRequests,
      sampleFixtures: 3,
      wait: async () => { waits++; },
      onRaw: (_name, body) => raws.push(body)
    });
  return { client, raws, run, waits: () => waits };
}

describe('runProbe', () => {
  it('сезон открыт: проверяет до N завершённых матчей текущего сезона', async () => {
    const f = await setup(baseRoutes).run();
    expect(f.account).toEqual({ plan: 'Free', requestsToday: 3, limitDay: 100 });
    expect(f.league).toEqual({ id: 389, name: 'Premier League' });
    expect(f.target).toEqual({ year: 2026, accessible: true });
    expect(f.sampleSeason).toBe(2026);
    expect(f.fixturesInSeason).toBe(4);
    expect(f.fixtures.map((x) => x.fixtureId)).toEqual([1003, 1002, 1001]);
    expect(f.live).toEqual({ checked: true, liveNow: 1 });
    expect(f.seasons.map((s) => s.year)).toEqual([2025, 2026]);
    expect(f.requestsUsed).toBe(10);
    expect(f.problems).toEqual([]);
  });

  it('сезон закрыт тарифом: фиксирует блокировку и берёт последний разрешённый сезон', async () => {
    const f = await setup({
      ...baseRoutes,
      '/fixtures?league=389&season=2026': fail({ plan: 'Free plans do not have access to this season, try from 2021 to 2023.' }),
      '/fixtures?league=389&season=2023': ok([listItem(1001, '2023-09-01T15:00:00+00:00', 'FT')])
    }).run();
    expect(f.target.accessible).toBe(false);
    expect(f.target.blockedBy).toBe('plan');
    expect(f.target.blockedMessage).toContain('Free plans');
    expect(f.sampleSeason).toBe(2023);
    expect(f.fixtures).toHaveLength(1);
  });

  it('не превышает лимит запросов', async () => {
    const s = setup(baseRoutes, 5);
    const f = await s.run();
    expect(f.requestsUsed).toBeLessThanOrEqual(5);
    expect(s.client.requestCount()).toBeLessThanOrEqual(5);
    expect(f.problems.join(' ')).toContain('лимит');
    expect(f.live.checked).toBe(false);
  });

  it('ждёт между запросами', async () => {
    const s = setup(baseRoutes);
    const f = await s.run();
    expect(s.waits()).toBe(f.requestsUsed - 1);
  });

  it('ошибка лимита API не роняет зонд', async () => {
    const f = await setup({
      ...baseRoutes,
      '/fixtures?id=1002': fail({ rateLimit: 'Too many requests. Your rate limit is 10 requests per minute.' })
    }).run();
    expect(f.fixtures.map((x) => x.fixtureId)).toEqual([1003, 1001]);
    expect(f.problems.join(' ')).toContain('1002');
  });

  it('ҚПЛ не найдена: зонд останавливается с понятной записью', async () => {
    const f = await setup({ ...baseRoutes, '/leagues?country=Kazakhstan': ok([]) }).run();
    expect(f.league).toBeNull();
    expect(f.problems.join(' ')).toContain('не найдена');
  });

  it('сырые ответы сохраняются без ключа и без личных данных аккаунта', async () => {
    const s = setup(baseRoutes);
    await s.run();
    expect(s.raws.length).toBeGreaterThan(0);
    const all = JSON.stringify(s.raws);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain('owner@example.com');
    expect(all).not.toContain('Nurlan');
  });

  it('сезон не получен не из-за тарифа (неверный ключ): причина — other', async () => {
    const f = await setup({ ...baseRoutes, '/fixtures?league=389&season=2026': fail({ token: 'Error/Missing application key.' }) }).run();
    expect(f.target).toMatchObject({ accessible: false, blockedBy: 'other' });
    expect(f.sampleSeason).toBeNull();
  });
});

describe('parseAllowedSeasons', () => {
  it('достаёт разрешённые сезоны из текста ошибки тарифа', () => {
    expect(parseAllowedSeasons('Free plans do not have access to this season, try from 2021 to 2023.')).toEqual({ from: 2021, to: 2023 });
    expect(parseAllowedSeasons('other')).toBeNull();
  });
});
