// Playwright үшін жалған бэкенд: желі сұрауларын scripts/dev/screens-data.ts жасаған data.json-нан қайтарады.
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';

export const MOCK_URL = 'http://mock.supabase.test';
type Row = Record<string, unknown>;
export interface MockData {
  view: { picks: { playerId: string; lastName: string; isCaptain: boolean; slot: number }[] };
  clubs: Row[];
  players: Row[];
  seasonStats: Row[];
  selection: Row[];
  gameweeks: Row[];
  fixtures: Row[];
  matches: Row[];
}

export function loadData(): MockData {
  return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'data.json'), 'utf-8')) as MockData;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

export async function mockBackend(page: Page, data: MockData, opts: { theme: 'light' | 'dark'; lang: 'kk' | 'ru' }): Promise<void> {
  await page.addInitScript(({ theme, lang }) => {
    const noop = () => {};
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: { initData: 'dev', colorScheme: theme, initDataUnsafe: { user: { language_code: lang } }, ready: noop, expand: noop, setHeaderColor: noop, setBackgroundColor: noop, onEvent: noop, offEvent: noop }
    };
  }, opts);
  await page.route('https://telegram.org/**', (r) => r.abort());
  await page.route(`${MOCK_URL}/**`, (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const p = url.pathname;
    const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, '') ?? null;
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (p === '/functions/v1/auth-telegram') return json({ token: 'mock-token', user: { id: 'u1', displayName: 'Скриншот', lang: opts.lang, notify: true, teamName: 'Сарыарқа FC' } });
    if (p === '/functions/v1/leaderboard') {
      const names = ['Ертіс Ultras', 'Алматы Барс', 'Тобыл Фан', null, 'Қайрат 1954', 'Сарыарқа FC', 'Кызылжар SK', 'Ақтөбе Жүрек'];
      const rows = names.map((teamName, i) => ({ rank: i + 1, teamName, gwPoints: 70 - i * 6, total: 1480 - i * 23, me: teamName === 'Сарыарқа FC' }));
      return json({ gameweek: 29, status: 'played', total: 214, rows, me: rows[5] });
    }
    if (p === '/functions/v1/team-view') return json(data.view);
    if (p === '/functions/v1/squad-save') return json({ ok: true, value: null });
    if (p === '/functions/v1/transfer-commit') return json({ ok: true, value: { penalty: 0, freeLeft: 0, bank: 0 } });
    if (p === '/rest/v1/clubs') return json(data.clubs);
    if (p === '/rest/v1/players') return json(data.players);
    if (p === '/rest/v1/player_selection') return json(data.selection);
    if (p === '/rest/v1/gameweeks') return json(data.gameweeks);
    if (p === '/rest/v1/player_season_stats') {
      const id = eq('player_id');
      return json(id ? data.seasonStats.filter((s) => s.player_id === id) : data.seasonStats);
    }
    if (p === '/rest/v1/player_match_stats') {
      const id = eq('player_id');
      return json(data.matches.filter((m) => m.player_id === id && m.status === 'finished')
        .map((m) => ({ points: m.points, minutes: m.minutes, fixtures: { kickoff: m.kickoff, status: m.status, gameweeks: { number: m.number } } })));
    }
    if (p === '/rest/v1/fixtures') {
      const gw = eq('gameweeks.number');
      return json(data.fixtures.filter((f) => gw === null || String(f.number) === gw).map((f) => ({ ...f, gameweeks: { number: f.number } })));
    }
    return json({ message: `mock: нет ответа для ${p}` }, 404);
  });
}
