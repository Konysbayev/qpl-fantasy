import { describe, expect, it } from 'vitest';
import { buildPlayerMatchStats } from '../src/match-stats.js';
import type { LineupPlayer, MatchEvent, MatchFacts, Position } from '../src/types.js';

// Хозяева (id 1): вратарь 11, защитник 12, запасные 13 и 14. Гости (id 2): вратарь 21, нападающий 22, запасной 23.
function player(sourceId: number, teamSourceId: number, position: Position | null, starter: boolean): LineupPlayer {
  return { sourceId, firstName: 'Имя', lastName: `Игрок${sourceId}`, number: sourceId, position, teamSourceId, starter, isCaptain: false };
}

const lineups: LineupPlayer[] = [
  player(11, 1, 'GK', true),
  player(12, 1, 'DEF', true),
  player(13, 1, 'MID', false),
  player(14, 1, 'FWD', false),
  player(21, 2, 'GK', true),
  player(22, 2, 'FWD', true),
  player(23, 2, 'MID', false)
];

function facts(events: MatchEvent[], score: [number, number] = [2, 1]): MatchFacts {
  return {
    sourceId: 1,
    seasonSourceId: 200,
    tour: 1,
    kickoff: '2026-03-07T14:00:00+05:00',
    status: 'finished',
    home: { sourceId: 1, name: 'Хозяева', nameKz: null, logoUrl: null },
    away: { sourceId: 2, name: 'Гости', nameKz: null, logoUrl: null },
    homeScore: score[0],
    awayScore: score[1],
    lineups,
    events
  };
}

const goal = (minute: number, teamSourceId: number, playerSourceId: number, assistSourceId: number | null = null): MatchEvent =>
  ({ kind: 'goal', minute, teamSourceId, playerSourceId, assistSourceId });
const sub = (minute: number, teamSourceId: number, outSourceId: number, inSourceId: number): MatchEvent =>
  ({ kind: 'sub', minute, teamSourceId, outSourceId, inSourceId });

// Счёт 2:1 по умолчанию: два гола хозяев и один гол гостей
const baseGoals: MatchEvent[] = [goal(10, 1, 12), goal(20, 1, 12), goal(30, 2, 22)];

function statOf(m: MatchFacts, id: number) {
  const s = buildPlayerMatchStats(m).stats.find((x) => x.playerSourceId === id);
  if (!s) throw new Error(`нет статистики игрока ${id}`);
  return s;
}

describe('buildPlayerMatchStats', () => {
  it('игрок основы без замен играет 90 минут', () => {
    const s = statOf(facts(baseGoals), 11);
    expect(s).toMatchObject({ minutes: 90, onMinute: 0, offMinute: null, position: 'GK', teamSourceId: 1 });
  });

  it('замена на 60-й: ушедший 60 минут, вышедший 30', () => {
    const m = facts([...baseGoals, sub(60, 1, 12, 13)]);
    expect(statOf(m, 12)).toMatchObject({ minutes: 60, onMinute: 0, offMinute: 60 });
    expect(statOf(m, 13)).toMatchObject({ minutes: 30, onMinute: 60, offMinute: null });
  });

  it('вышедший на 93-й минуте получает 1 минуту', () => {
    const m = facts([...baseGoals, sub(93, 1, 12, 13)]);
    expect(statOf(m, 13).minutes).toBe(1);
    expect(statOf(m, 12).minutes).toBe(90);
  });

  it('гол на 92-й минуте засчитывается как пропущенный тем, кто на поле', () => {
    const m = facts([...baseGoals, goal(92, 1, 12)], [3, 1]);
    expect(statOf(m, 21).conceded).toBe(3);
  });

  it('ушедший на 60-й не получает гол, пропущенный на 60-й', () => {
    const m = facts([goal(10, 1, 12), goal(20, 1, 12), sub(60, 2, 22, 23), goal(60, 1, 12)], [3, 0]);
    // Пропущенные считаются у команды гостей: 22 ушёл на 60-й, 23 вышел на 60-й
    expect(statOf(m, 22).conceded).toBe(2);
    expect(statOf(m, 23).conceded).toBe(1);
  });

  it('гол в компенсации первого тайма (45+2) не засчитывается вышедшему в перерыве', () => {
    const m = facts([
      goal(10, 1, 12), goal(20, 1, 12),
      { kind: 'goal', minute: 47, half: 1, teamSourceId: 2, playerSourceId: 22, assistSourceId: null },
      { kind: 'sub', minute: 46, half: 2, teamSourceId: 1, outSourceId: 12, inSourceId: 13 }
    ]);
    expect(statOf(m, 12).conceded).toBe(1);
    expect(statOf(m, 13).conceded).toBe(0);
  });

  it('идущий матч: минуты считаются до последнего события, а не до 90-й', () => {
    const m = { ...facts([goal(10, 1, 12), goal(20, 1, 12)], [2, 0]), status: 'live' as const };
    expect(statOf(m, 21).minutes).toBe(20);
    expect(statOf(m, 11).minutes).toBe(20);
    expect(buildPlayerMatchStats(m).needsReview).toEqual([]);
  });

  it('вторая жёлтая: red 1, yellow 0, уход с поля на этой минуте', () => {
    const m = facts([
      ...baseGoals,
      { kind: 'yellow', minute: 40, teamSourceId: 2, playerSourceId: 22 },
      { kind: 'second_yellow', minute: 70, teamSourceId: 2, playerSourceId: 22 }
    ]);
    expect(statOf(m, 22)).toMatchObject({ red: 1, yellow: 0, offMinute: 70, minutes: 70 });
  });

  it('пенальти считается голом и пенальти', () => {
    const m = facts([goal(10, 1, 12), { kind: 'penalty_goal', minute: 20, teamSourceId: 1, playerSourceId: 12, assistSourceId: null }, goal(30, 2, 22)]);
    expect(statOf(m, 12)).toMatchObject({ goals: 2, penaltyGoals: 1 });
    expect(statOf(m, 21).conceded).toBe(2);
  });

  it('ассист достаётся ассистенту', () => {
    const m = facts([goal(10, 1, 12, 11), goal(20, 1, 12), goal(30, 2, 22)]);
    expect(statOf(m, 11).assists).toBe(1);
    expect(statOf(m, 12)).toMatchObject({ goals: 2, assists: 0 });
  });

  it('автогол засчитывается автору и как пропущенный его команде', () => {
    const m = facts([...baseGoals, { kind: 'own_goal', minute: 50, teamSourceId: 2, playerSourceId: 22, assistSourceId: null }], [3, 1]);
    expect(statOf(m, 22).ownGoals).toBe(1);
    expect(statOf(m, 21).conceded).toBe(3);
    expect(buildPlayerMatchStats(m).needsReview).toEqual([]);
  });

  it('счёт не сходится с событиями → needsReview', () => {
    const r = buildPlayerMatchStats(facts(baseGoals, [3, 1]));
    expect(r.needsReview).toHaveLength(1);
  });

  it('неизвестное событие → needsReview, разбор не падает', () => {
    const r = buildPlayerMatchStats(facts([...baseGoals, { kind: 'unknown', minute: 55, rawType: 'var_check' }]));
    expect(r.needsReview).toHaveLength(1);
    expect(r.needsReview[0]).toContain('var_check');
  });

  it('у игрока основы нет позиции → needsReview', () => {
    const m = facts(baseGoals);
    m.lineups = [...lineups.slice(0, 6), player(24, 2, null, true)];
    expect(buildPlayerMatchStats(m).needsReview).toHaveLength(1);
  });

  it('запасной, который не вышел, — 0 минут и не попадает в пропущенные', () => {
    const s = statOf(facts(baseGoals), 14);
    expect(s).toMatchObject({ minutes: 0, onMinute: null, offMinute: null, conceded: 0 });
  });
});
