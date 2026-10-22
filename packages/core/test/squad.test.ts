import { describe, expect, it } from 'vitest';
import {
  canUseWildcard, clampPrice, nextFreeTransfers, priceDelta, transferPenalty, validateSquad, type SquadPlayer
} from '../src/squad.js';
import type { Position } from '../src/types.js';

// 15 ойыншы: 2/5/5/3, 5 клубтан 3-тен, әрқайсысы 6.0 млн → 90.0 млн
function squad(): SquadPlayer[] {
  const positions: Position[] = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'];
  return positions.map((position, i) => ({ id: `p${i}`, position, clubId: `c${i % 5}`, price: 60 }));
}

const THRESHOLDS = { steps: [[0.05, 1], [0.1, 2], [0.2, 3]] as [number, number][] };

describe('validateSquad', () => {
  it('правильный состав → без ошибок', () => {
    expect(validateSquad(squad())).toEqual([]);
  });

  it('16 игроков → size', () => {
    expect(validateSquad([...squad(), { id: 'x', position: 'MID', clubId: 'c9', price: 40 }])).toContain('size');
  });

  it('3 вратаря → positions', () => {
    const s = squad();
    s[2] = { ...s[2], position: 'GK' };
    expect(validateSquad(s)).toEqual(['positions']);
  });

  it('4 из одного клуба → club_limit', () => {
    const s = squad();
    s[1] = { ...s[1], clubId: 'c0' };
    expect(validateSquad(s)).toEqual(['club_limit']);
  });

  it('сумма 1001 → budget', () => {
    const s = squad();
    s[0] = { ...s[0], price: 60 + 1001 - 900 };
    expect(validateSquad(s)).toEqual(['budget']);
  });
});

describe('transferPenalty', () => {
  const state = { freeTransfers: 1, unlimited: false, wildcard: false };

  it('1 трансфер при 1 бесплатном → 0', () => {
    expect(transferPenalty(1, state)).toEqual({ penalty: 0, freeLeft: 0 });
  });

  it('3 трансфера при 1 бесплатном → −8', () => {
    expect(transferPenalty(3, state)).toEqual({ penalty: -8, freeLeft: 0 });
  });

  it('без ограничений или с Wildcard → 0, бесплатные не тратятся', () => {
    expect(transferPenalty(5, { ...state, unlimited: true })).toEqual({ penalty: 0, freeLeft: 1 });
    expect(transferPenalty(5, { ...state, wildcard: true })).toEqual({ penalty: 0, freeLeft: 1 });
  });

  it('неиспользованные бесплатные копятся до 5', () => {
    expect(transferPenalty(0, { ...state, freeTransfers: 3 })).toEqual({ penalty: 0, freeLeft: 3 });
    expect(nextFreeTransfers(4)).toBe(5);
    expect(nextFreeTransfers(5)).toBe(5);
    expect(nextFreeTransfers(0)).toBe(1);
  });
});

describe('canUseWildcard', () => {
  it('один на туры 1–15 и один на 16–30', () => {
    expect(canUseWildcard(10, [])).toBe(true);
    expect(canUseWildcard(12, [3])).toBe(false);
    expect(canUseWildcard(20, [3])).toBe(true);
    expect(canUseWildcard(25, [3, 18])).toBe(false);
  });
});

describe('priceDelta и clampPrice', () => {
  it('изменение цены по доле чистых покупок', () => {
    expect(priceDelta(50, 1000, THRESHOLDS)).toBe(1);
    expect(priceDelta(120, 1000, THRESHOLDS)).toBe(2);
    expect(priceDelta(250, 1000, THRESHOLDS)).toBe(3);
    expect(priceDelta(-70, 1000, THRESHOLDS)).toBe(-1);
    expect(priceDelta(30, 1000, THRESHOLDS)).toBe(0);
    expect(priceDelta(10, 0, THRESHOLDS)).toBe(0);
  });

  it('цена в пределах 3.5–12.0 млн', () => {
    expect(clampPrice(121)).toBe(120);
    expect(clampPrice(30)).toBe(35);
    expect(clampPrice(60)).toBe(60);
  });
});
