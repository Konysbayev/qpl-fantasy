// Бастапқы бағалардың жобасы 2026 маусымының ұпайларынан (спецификация 12.5: Claude дайындайды, иесі бекітеді).
import type { Position } from './types.js';

export interface PlayerSeason {
  id: string;
  position: Position;
  points: number;
  minutes: number;
}

export const PRICE_RULES = { min: 40, max: { GK: 60, DEF: 70, MID: 100, FWD: 100 }, minMinutes: 450, step: 5 } as const;

const CURVE = 0.7;

// баға = 40 + (max − 40) × (ұпай / позициядағы үздік)^0.7, 0.5 млн-ға дейін төмен дөңгелектенеді; 450 минуттан аз — 40
export function draftPrices(players: PlayerSeason[]): Map<string, number> {
  const eligible = (p: PlayerSeason) => p.minutes >= PRICE_RULES.minMinutes;
  const best = new Map<Position, number>();
  for (const p of players) if (eligible(p)) best.set(p.position, Math.max(best.get(p.position) ?? 0, p.points));

  const prices = new Map<string, number>();
  for (const p of players) {
    const top = best.get(p.position) ?? 0;
    if (!eligible(p) || top <= 0 || p.points <= 0) {
      prices.set(p.id, PRICE_RULES.min);
      continue;
    }
    const raw = PRICE_RULES.min + (PRICE_RULES.max[p.position] - PRICE_RULES.min) * (p.points / top) ** CURVE;
    // 1e-9 — 100.0-дің 99.999…-ға айналып кетпеуі үшін
    prices.set(p.id, Math.floor((raw + 1e-9) / PRICE_RULES.step) * PRICE_RULES.step);
  }
  return prices;
}
