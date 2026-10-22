import { describe, expect, it } from 'vitest';
import { scorePlayer } from '../src/scoring.js';
import { DEFAULT_RULES } from '../src/rules.js';
import { buildPlayerMatchStats } from '../src/match-stats.js';
import type { MatchFacts, PlayerMatchStat } from '../src/types.js';

function stat(over: Partial<PlayerMatchStat> = {}): PlayerMatchStat {
  return {
    playerSourceId: 1, teamSourceId: 1, position: 'DEF', minutes: 90, onMinute: 0, offMinute: null,
    goals: 0, assists: 0, penaltyGoals: 0, ownGoals: 0, yellow: 0, red: 0, conceded: 1,
    penaltiesSaved: 0, penaltiesMissed: 0, ...over
  };
}

const total = (s: PlayerMatchStat, pos: 'GK' | 'DEF' | 'MID' | 'FWD' = 'DEF') => scorePlayer(s, pos, DEFAULT_RULES).total;

describe('scorePlayer', () => {
  it('1–59 минут = 1, 60+ = 2', () => {
    expect(total(stat({ minutes: 59 }))).toBe(1);
    expect(total(stat({ minutes: 60 }))).toBe(2);
  });

  it('гол вратаря/защитника 6, полузащитника 5, нападающего 4', () => {
    expect(total(stat({ goals: 1 }), 'GK')).toBe(2 + 6);
    expect(total(stat({ goals: 1 }), 'DEF')).toBe(2 + 6);
    expect(total(stat({ goals: 1 }), 'MID')).toBe(2 + 5);
    expect(total(stat({ goals: 1 }), 'FWD')).toBe(2 + 4);
  });

  it('ассист 3', () => {
    expect(total(stat({ assists: 2 }), 'MID')).toBe(2 + 6);
  });

  it('сухой матч: защитник 60+ минут = 4, полузащитник = 1, нападающий = 0', () => {
    expect(total(stat({ conceded: 0 }), 'DEF')).toBe(2 + 4);
    expect(total(stat({ conceded: 0 }), 'MID')).toBe(2 + 1);
    expect(total(stat({ conceded: 0 }), 'FWD')).toBe(2);
  });

  it('сухой матч не даётся при 59 минутах', () => {
    expect(total(stat({ conceded: 0, minutes: 59 }), 'DEF')).toBe(1);
  });

  it('каждые 2 пропущенных у вратаря и защитника −1 (3 пропущенных = −1, 4 = −2)', () => {
    expect(total(stat({ conceded: 3 }), 'GK')).toBe(2 - 1);
    expect(total(stat({ conceded: 4 }), 'DEF')).toBe(2 - 2);
    expect(total(stat({ conceded: 4 }), 'MID')).toBe(2);
  });

  it('жёлтая −1, удаление −3, автогол −2', () => {
    expect(total(stat({ yellow: 1 }), 'MID')).toBe(2 - 1);
    expect(total(stat({ red: 1 }), 'MID')).toBe(2 - 3);
    expect(total(stat({ ownGoals: 1 }), 'MID')).toBe(2 - 2);
  });

  it('вторая жёлтая = только −3', () => {
    const m: MatchFacts = {
      sourceId: 1, seasonSourceId: 200, tour: 1, kickoff: '2026-03-07T14:00:00+05:00', status: 'finished',
      home: { sourceId: 1, name: 'A', nameKz: null, logoUrl: null }, away: { sourceId: 2, name: 'B', nameKz: null, logoUrl: null },
      homeScore: 0, awayScore: 0,
      lineups: [{ sourceId: 7, firstName: 'А', lastName: 'Б', number: 7, position: 'MID', teamSourceId: 1, starter: true, isCaptain: false }],
      events: [
        { kind: 'yellow', minute: 10, teamSourceId: 1, playerSourceId: 7 },
        { kind: 'second_yellow', minute: 70, teamSourceId: 1, playerSourceId: 7 }
      ]
    };
    const s = buildPlayerMatchStats(m).stats[0];
    // 70 минут = 2, сухой матч полузащитника = 1, удаление = −3
    expect(scorePlayer(s, 'MID', DEFAULT_RULES).lines).toEqual([
      { code: 'appearance', points: 2 },
      { code: 'clean_sheet', points: 1 },
      { code: 'red', points: -3 }
    ]);
  });

  it('не выходил — 0 очков', () => {
    expect(scorePlayer(stat({ minutes: 0, onMinute: null, conceded: 0 }), 'DEF', DEFAULT_RULES)).toEqual({ total: 0, lines: [] });
  });

  it('правила из настроек сезона: гол нападающего 5 вместо 4', () => {
    const rules = { ...DEFAULT_RULES, goal: { ...DEFAULT_RULES.goal, FWD: 5 } };
    expect(scorePlayer(stat({ goals: 1 }), 'FWD', rules).total).toBe(2 + 5);
  });
});
