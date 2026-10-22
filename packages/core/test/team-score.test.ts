import { describe, expect, it } from 'vitest';
import { isValidFormation, scoreGameweekTeam, type Pick, type PlayerGameweek } from '../src/team-score.js';
import type { Position } from '../src/types.js';

// Негізгі 4-4-2: g1 | d1–d4 | m1–m4 | f1 f2. Қосалқы: g2, d5, m5, f3.
const order: [string, Position][] = [
  ['g1', 'GK'], ['d1', 'DEF'], ['d2', 'DEF'], ['d3', 'DEF'], ['d4', 'DEF'],
  ['m1', 'MID'], ['m2', 'MID'], ['m3', 'MID'], ['m4', 'MID'], ['f1', 'FWD'], ['f2', 'FWD'],
  ['g2', 'GK'], ['d5', 'DEF'], ['m5', 'MID'], ['f3', 'FWD']
];

function setup(over: Record<string, Partial<PlayerGameweek>> = {}, captain = 'f1', vice = 'm1') {
  const picks: Pick[] = order.map(([id], i) => ({ playerId: id, slot: i + 1, isCaptain: id === captain, isVice: id === vice }));
  const players = new Map<string, PlayerGameweek>(
    order.map(([id, position]) => [id, { position, points: 2, played: true, ...over[id] }])
  );
  return { picks, players };
}

describe('scoreGameweekTeam', () => {
  it('сумма очков основы, капитан ×2', () => {
    const { picks, players } = setup({ f1: { points: 10 } });
    const r = scoreGameweekTeam(picks, players);
    expect(r.total).toBe(10 * 2 + 10 * 2);
    expect(r.captainId).toBe('f1');
    expect(r.subsIn).toEqual([]);
  });

  it('капитан не сыграл → ×2 у вице', () => {
    const { picks, players } = setup({
      f1: { points: 0, played: false }, m1: { points: 5 },
      d5: { played: false, points: 0 }, m5: { played: false, points: 0 }, f3: { played: false, points: 0 }
    });
    const r = scoreGameweekTeam(picks, players);
    expect(r.captainId).toBe('m1');
    // 9 по 2 + вице 5×2; f1 некем заменить (полевые запасные тоже не играли)
    expect(r.total).toBe(9 * 2 + 10);
  });

  it('оба не сыграли → без удвоения', () => {
    const { picks, players } = setup({
      f1: { played: false, points: 0 }, m1: { played: false, points: 0 },
      m5: { played: false, points: 0 }, f3: { played: false, points: 0 }, d5: { played: false, points: 0 }
    });
    const r = scoreGameweekTeam(picks, players);
    expect(r.captainId).toBeNull();
    expect(r.total).toBe(9 * 2);
  });

  it('автозамена: первый сыгравший запасной входит', () => {
    const { picks, players } = setup({ m2: { played: false, points: 0 }, d5: { points: 6 } });
    const r = scoreGameweekTeam(picks, players);
    expect(r.subsIn).toEqual(['d5']);
    expect(r.finalXI).toContain('d5');
    expect(r.finalXI).not.toContain('m2');
    expect(r.total).toBe(9 * 2 + 6 + 2 * 2);
  });

  it('автозамена пропускает запасного, если ломается схема (остаётся 2 защитника)', () => {
    // Схема 3-5-2: защитник d1 не сыграл, первый запасной m5 сломал бы схему (2 защитника) → входит d5
    const picks: Pick[] = [
      ['g1', 1], ['d1', 2], ['d2', 3], ['d3', 4], ['m1', 5], ['m2', 6], ['m3', 7], ['m4', 8], ['m6', 9], ['f1', 10], ['f2', 11],
      ['g2', 12], ['m5', 13], ['d5', 14], ['f3', 15]
    ].map(([id, slot]) => ({ playerId: id as string, slot: slot as number, isCaptain: id === 'f1', isVice: false }));
    const pos: Record<string, Position> = { g1: 'GK', g2: 'GK', d1: 'DEF', d2: 'DEF', d3: 'DEF', d5: 'DEF', f1: 'FWD', f2: 'FWD', f3: 'FWD' };
    const players = new Map<string, PlayerGameweek>(
      picks.map((p) => [p.playerId, { position: pos[p.playerId] ?? 'MID', points: 2, played: p.playerId !== 'd1' }])
    );
    const r = scoreGameweekTeam(picks, players);
    expect(r.subsIn).toEqual(['d5']);
  });

  it('вратаря меняет только запасной вратарь', () => {
    const { picks, players } = setup({ g1: { played: false, points: 0 }, g2: { points: 3 } });
    const r = scoreGameweekTeam(picks, players);
    expect(r.subsIn).toEqual(['g2']);
    expect(r.total).toBe(9 * 2 + 3 + 2 * 2);
  });

  it('двойной тур: очки игрока за два матча уже суммированы и удваиваются у капитана', () => {
    const { picks, players } = setup({ f1: { points: 2 + 7 } });
    expect(scoreGameweekTeam(picks, players).total).toBe(10 * 2 + 9 * 2);
  });
});

describe('isValidFormation', () => {
  it('1 вратарь, ≥3 защитника, ≥1 нападающий, всего 11', () => {
    const f = (gk: number, def: number, mid: number, fwd: number): Position[] =>
      [...Array(gk).fill('GK'), ...Array(def).fill('DEF'), ...Array(mid).fill('MID'), ...Array(fwd).fill('FWD')];
    expect(isValidFormation(f(1, 4, 4, 2))).toBe(true);
    expect(isValidFormation(f(1, 3, 5, 2))).toBe(true);
    expect(isValidFormation(f(1, 2, 5, 3))).toBe(false);
    expect(isValidFormation(f(1, 5, 5, 0))).toBe(false);
    expect(isValidFormation(f(2, 4, 3, 2))).toBe(false);
    expect(isValidFormation(f(1, 4, 4, 1))).toBe(false);
  });
});
