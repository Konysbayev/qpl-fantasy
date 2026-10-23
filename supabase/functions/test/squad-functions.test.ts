import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '../../../packages/auth/src/telegram.js';
import { freshDb } from '../../../packages/db/test/helpers.js';
import { newUser, seedLeague, standardPicks, type League } from '../../../packages/db/test/league.js';
import { squadSave } from '../squad-save/handler.js';
import { teamView } from '../team-view/handler.js';
import { transferCommit } from '../transfer-commit/handler.js';

const SECRET = 'fn-test-secret';
let sql: postgres.Sql;
let L: League;
let user: string;
let token: string;
let nowSec: number;

beforeAll(async () => {
  sql = await freshDb('qpl_test_fn_squad');
});
afterAll(async () => {
  await sql?.end();
});
beforeEach(async () => {
  L = await seedLeague(sql);
  user = await newUser(sql);
  nowSec = Math.floor(L.gws[0].deadline.getTime() / 1000) - 3600;
  token = await signSession({ sub: user, tg: 1 }, SECRET, nowSec);
});

const req = (method: string, body?: unknown, auth: string | null = token) =>
  new Request('https://x/functions/v1/f', {
    method,
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
const deps = () => ({ sql, sessionSecret: SECRET, nowSec });

describe('team-view', () => {
  it('без сессии или с просроченной сессией → 401', async () => {
    expect((await teamView(req('GET', undefined, null), deps())).status).toBe(401);
    const old = await signSession({ sub: user, tg: 1 }, SECRET, nowSec - 8 * 86_400);
    expect((await teamView(req('GET', undefined, old), deps())).status).toBe(401);
    expect((await teamView(req('GET', undefined, `${token}x`), deps())).status).toBe(401);
  });

  it('со своей сессией → состав и открытый тур', async () => {
    const res = await teamView(req('GET'), deps());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ next: { number: 1 }, squad: null, picks: [] });
  });
});

describe('squad-save', () => {
  it('первое сохранение создаёт состав, второе меняет капитана', async () => {
    const first = await squadSave(req('POST', { gameweek: 1, picks: standardPicks(L) }), deps());
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true });

    const picks = standardPicks(L).map((p) => ({ ...p, isCaptain: p.slot === 2 }));
    const second = await squadSave(req('POST', { gameweek: 1, picks }), deps());
    expect(await second.json()).toEqual({ ok: true, value: null });
    const view = await (await teamView(req('GET'), deps())).json();
    expect(view.picks.find((p: { isCaptain: boolean }) => p.isCaptain).slot).toBe(2);
  });

  it('недопустимая схема → 409 invalid_lineup; мусор вместо состава → 400', async () => {
    await squadSave(req('POST', { gameweek: 1, picks: standardPicks(L) }), deps());
    const bad = standardPicks(L).map((p) => (p.slot === 4 ? { ...p, slot: 14 } : p.slot === 14 ? { ...p, slot: 4 } : p))
      .map((p) => (p.slot === 5 ? { ...p, slot: 15 } : p.slot === 15 ? { ...p, slot: 5 } : p));
    const res = await squadSave(req('POST', { gameweek: 1, picks: bad }), deps());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: 'invalid_lineup' });
    expect((await squadSave(req('POST', { gameweek: 1, picks: [{ playerId: 'x', slot: 1 }] }), deps())).status).toBe(400);
    expect((await squadSave(req('POST', { picks: standardPicks(L) }), deps())).status).toBe(400);
  });
});

describe('ограничение частоты', () => {
  it('слишком много сохранений за минуту → 429, состав не трогается', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await squadSave(req('POST', { gameweek: 1, picks: standardPicks(L) }), deps())).status);
    expect(statuses.slice(0, 20).every((s) => s !== 429)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe('transfer-commit', () => {
  it('трансфер проходит; повтор того же requestId возвращает тот же ответ', async () => {
    await squadSave(req('POST', { gameweek: 1, picks: standardPicks(L) }), deps());
    nowSec = Math.floor(L.gws[1].deadline.getTime() / 1000) - 60;
    token = await signSession({ sub: user, tg: 1 }, SECRET, nowSec);
    const body = { requestId: randomUUID(), gameweek: 2, out: [L.player('DEF', 4), L.player('FWD', 4)], in: [L.player('DEF', 5), L.player('FWD', 5)], wildcard: false };
    const a = await transferCommit(req('POST', body), deps());
    expect(a.status).toBe(200);
    const value = await a.json();
    expect(value).toEqual({ ok: true, value: { penalty: -4, freeLeft: 0, bank: 250 } });
    expect(await (await transferCommit(req('POST', body), deps())).json()).toEqual(value);
  });

  it('после дедлайна → 409 deadline_passed; без requestId → 400', async () => {
    await squadSave(req('POST', { gameweek: 1, picks: standardPicks(L) }), deps());
    nowSec = Math.floor(L.gws[1].deadline.getTime() / 1000) + 1;
    token = await signSession({ sub: user, tg: 1 }, SECRET, nowSec);
    const body = { requestId: randomUUID(), gameweek: 2, out: [L.player('DEF', 4)], in: [L.player('DEF', 5)], wildcard: false };
    const late = await transferCommit(req('POST', body), deps());
    expect(late.status).toBe(409);
    expect(await late.json()).toEqual({ ok: false, error: 'deadline_passed' });
    expect((await transferCommit(req('POST', { ...body, requestId: 'abc' }), deps())).status).toBe(400);
  });
});
