import { describe, expect, it } from 'vitest';
import { draftPrices, PRICE_RULES, type PlayerSeason } from '../src/pricing.js';

const season = (id: string, position: PlayerSeason['position'], points: number, minutes = 2000): PlayerSeason => ({ id, position, points, minutes });

describe('draftPrices', () => {
  const players = [
    season('fwd-best', 'FWD', 120),
    season('fwd-half', 'FWD', 60),
    season('fwd-short', 'FWD', 30, 300),
    season('gk-best', 'GK', 101),
    season('gk-other', 'GK', 40),
    season('def-best', 'DEF', 128),
    season('mid-zero', 'MID', 0),
    season('mid-best', 'MID', 122),
    season('mid-negative', 'MID', -3)
  ];
  const prices = draftPrices(players);

  it('лучший нападающий стоит 10.0 млн', () => {
    expect(prices.get('fwd-best')).toBe(100);
  });

  it('нападающий с половиной очков лучшего — по формуле: 40 + 60 × 0.5^0.7 = 76.9 → вниз до 7.5', () => {
    expect(prices.get('fwd-half')).toBe(75);
  });

  it('меньше 450 минут → 4.0 млн, даже с очками', () => {
    expect(prices.get('fwd-short')).toBe(40);
  });

  it('вратарь не дороже 6.0, защитник не дороже 7.0', () => {
    expect(prices.get('gk-best')).toBe(60);
    expect(prices.get('def-best')).toBe(70);
  });

  it('ноль и минус очков → минимальная цена', () => {
    expect(prices.get('mid-zero')).toBe(40);
    expect(prices.get('mid-negative')).toBe(40);
  });

  it('все цены кратны 0.5 млн и в пределах 4.0–10.0', () => {
    for (const p of prices.values()) {
      expect(p % PRICE_RULES.step).toBe(0);
      expect(p).toBeGreaterThanOrEqual(40);
      expect(p).toBeLessThanOrEqual(100);
    }
    expect(prices.size).toBe(players.length);
  });
});
