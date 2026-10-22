import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ParseError, parseMatchPage } from '../src/match.js';

const fixture = (id: number) =>
  gunzipSync(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', `match-${id}.html.gz`))).toString('utf-8');

// Бір push блогы бар синтетикалық бет
function syntheticPage(data: unknown): string {
  const payload = JSON.stringify(`1:${JSON.stringify(data)}\n`);
  return `<html><body><script>self.__next_f.push([1,${payload}])</script></body></html>`;
}

describe('parseMatchPage', () => {
  it('матч 993: Кызылжар 2:4 Кайрат, тур 14, сезон 200, finished', () => {
    const m = parseMatchPage(fixture(993), 993);
    expect(m).toMatchObject({
      sourceId: 993,
      seasonSourceId: 200,
      tour: 14,
      kickoff: '2026-06-21T18:00:00+05:00',
      status: 'finished',
      homeScore: 2,
      awayScore: 4
    });
    expect(m.home.sourceId).toBe(87);
    expect(m.away.sourceId).toBe(13);
    expect(m.home.name).toBe('Кызылжар');
  });

  it('матч 993: составы 11+11 в основе, вратарь Челядник', () => {
    const m = parseMatchPage(fixture(993), 993);
    expect(m.lineups.filter((p) => p.starter)).toHaveLength(22);
    expect(m.lineups.find((p) => p.sourceId === 445)).toMatchObject({ position: 'GK', teamSourceId: 87, lastName: 'Челядник', starter: true });
  });

  it('матч 993: гол Оксанена с ассистом Юкколы на 9-й', () => {
    const m = parseMatchPage(fixture(993), 993);
    expect(m.events).toContainEqual({ kind: 'goal', minute: 9, playerSourceId: 2560, assistSourceId: 2562, teamSourceId: 13 });
  });

  it('матч 993: замена на 33-й — ушёл 2560, вышел 1872', () => {
    const m = parseMatchPage(fixture(993), 993);
    expect(m.events).toContainEqual({ kind: 'sub', minute: 33, teamSourceId: 13, outSourceId: 2560, inSourceId: 1872 });
  });

  it('матч 993: 4 гола с игры и 2 пенальти, без дубликатов', () => {
    const m = parseMatchPage(fixture(993), 993);
    expect(m.events.filter((e) => e.kind === 'goal')).toHaveLength(4);
    expect(m.events.filter((e) => e.kind === 'penalty_goal')).toHaveLength(2);
    expect(m.events.filter((e) => e.kind === 'second_yellow')).toHaveLength(1);
    expect(m.events.some((e) => e.kind === 'unknown')).toBe(false);
  });

  it('матч 993: событие без player_id находится по номеру в составе (замена на 46-й)', () => {
    const m = parseMatchPage(fixture(993), 993);
    const sub46 = m.events.find((e) => e.kind === 'sub' && e.minute === 46);
    expect(sub46).toMatchObject({ teamSourceId: 13, inSourceId: 876 });
    const out = m.lineups.find((p) => p.teamSourceId === 13 && p.number === 9);
    expect(sub46 && 'outSourceId' in sub46 ? sub46.outSourceId : null).toBe(out?.sourceId);
  });

  it('матч 1109 (будущий): upcoming, составов и событий нет', () => {
    const m = parseMatchPage(fixture(1109), 1109);
    expect(m).toMatchObject({ status: 'upcoming', tour: 29, kickoff: '2026-10-25T18:00:00+05:00', lineups: [], events: [] });
  });

  it('матч 896: 0:0, событий голов нет', () => {
    const m = parseMatchPage(fixture(896), 896);
    expect(m).toMatchObject({ homeScore: 0, awayScore: 0, status: 'finished' });
    expect(m.events.filter((e) => e.kind === 'goal' || e.kind === 'penalty_goal')).toHaveLength(0);
    expect(m.lineups.length).toBeGreaterThanOrEqual(22);
  });

  it('HTML без встроенных данных → ParseError', () => {
    expect(() => parseMatchPage('<html>403 Forbidden</html>', 1)).toThrow(ParseError);
  });

  it('матча с нужным id на странице нет → ParseError', () => {
    expect(() => parseMatchPage(fixture(993), 994)).toThrow(ParseError);
  });

  it('неизвестный event_type → unknown', () => {
    const html = syntheticPage({
      match: {
        id: 5, date: '2026-03-07', time: '14:00', tour: 1, season_id: 200, status: 'finished',
        home_team: { id: 1, name: 'A', name_kz: 'A', logo_url: null }, away_team: { id: 2, name: 'B', name_kz: '$undefined', logo_url: null },
        home_score: 0, away_score: 0
      },
      lineups: { home_team: { team_id: 1, starters: [], substitutes: [] }, away_team: { team_id: 2, starters: [], substitutes: [] } },
      events: [{ id: 1, minute: 50, event_type: 'var_check', team_id: 1, player_id: null, assist_player_id: null, player2_id: null }]
    });
    const m = parseMatchPage(html, 5);
    expect(m.events).toEqual([{ kind: 'unknown', minute: 50, rawType: 'var_check' }]);
    expect(m.away.nameKz).toBeNull();
  });
});
