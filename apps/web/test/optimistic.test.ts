import { describe, expect, it } from 'vitest';
import type { TeamPick, TeamView } from '../../../packages/core/src/api-types.js';
import { applyPicks } from '../src/optimistic.js';

const pick = (i: number, extra: Partial<TeamPick> = {}): TeamPick => ({
  playerId: `p${i}`, slot: i, isCaptain: i === 1, isVice: i === 2, firstName: 'А', lastName: `Ф${i}`, position: 'MID', clubId: 'c', price: 50, points: null, ...extra
});
const view: TeamView = { next: null, last: null, squad: null, picks: Array.from({ length: 15 }, (_, i) => pick(i + 1)) };

describe('applyPicks', () => {
  it('переносит новые места и роли на игроков, данные игроков сохраняются', () => {
    const picks = view.picks.map((p) => ({
      playerId: p.playerId,
      slot: p.playerId === 'p3' ? 12 : p.playerId === 'p12' ? 3 : p.slot,
      isCaptain: p.playerId === 'p2', isVice: p.playerId === 'p1'
    }));
    const next = applyPicks(view, picks)!;
    expect(next.picks.find((p) => p.playerId === 'p3')).toMatchObject({ slot: 12, lastName: 'Ф3' });
    expect(next.picks.find((p) => p.playerId === 'p12')).toMatchObject({ slot: 3 });
    expect(next.picks.find((p) => p.isCaptain)?.playerId).toBe('p2');
    expect(next.picks.find((p) => p.isVice)?.playerId).toBe('p1');
    expect(view.picks.find((p) => p.isCaptain)?.playerId).toBe('p1');
  });

  it('неизвестный игрок (первый состав) — null, экран не трогаем', () => {
    expect(applyPicks(view, [{ playerId: 'x', slot: 1, isCaptain: true, isVice: false }])).toBeNull();
  });
});
