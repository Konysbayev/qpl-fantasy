// Құрам, трансфер, Wildcard және баға ережелері (спецификация 4.1, 4.3). Ақша — миллионның оннан бір бөлігімен: 45 = 4.5 млн.
import type { Position } from './types.js';

export interface SquadPlayer {
  id: string;
  position: Position;
  clubId: string;
  price: number;
}

export type SquadError = 'size' | 'positions' | 'club_limit' | 'budget';

export const SQUAD_RULES = {
  size: 15,
  positions: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  maxPerClub: 3,
  budget: 1000
} as const;

const MAX_FREE_TRANSFERS = 5;
const TRANSFER_COST = -4;
const WILDCARD_HALVES: [number, number][] = [[1, 15], [16, 30]];
const PRICE_MIN = 35;
const PRICE_MAX = 120;

export function validateSquad(players: SquadPlayer[], budget: number = SQUAD_RULES.budget): SquadError[] {
  const errors: SquadError[] = [];
  if (players.length !== SQUAD_RULES.size) errors.push('size');
  const positions = Object.entries(SQUAD_RULES.positions) as [Position, number][];
  if (positions.some(([pos, n]) => players.filter((p) => p.position === pos).length !== n)) errors.push('positions');
  const perClub = new Map<string, number>();
  for (const p of players) perClub.set(p.clubId, (perClub.get(p.clubId) ?? 0) + 1);
  if ([...perClub.values()].some((n) => n > SQUAD_RULES.maxPerClub)) errors.push('club_limit');
  if (players.reduce((s, p) => s + p.price, 0) > budget) errors.push('budget');
  return errors;
}

export interface TransferState {
  freeTransfers: number;
  unlimited: boolean;
  wildcard: boolean;
}

export function transferPenalty(made: number, s: TransferState): { penalty: number; freeLeft: number } {
  if (s.unlimited || s.wildcard) return { penalty: 0, freeLeft: s.freeTransfers };
  const paid = Math.max(0, made - s.freeTransfers);
  return { penalty: paid === 0 ? 0 : paid * TRANSFER_COST, freeLeft: Math.max(0, s.freeTransfers - made) };
}

export function nextFreeTransfers(freeLeft: number): number {
  return Math.min(freeLeft + 1, MAX_FREE_TRANSFERS);
}

export function canUseWildcard(tour: number, usedOnTours: number[]): boolean {
  const half = WILDCARD_HALVES.find(([from, to]) => tour >= from && tour <= to);
  if (!half) return false;
  return !usedOnTours.some((t) => t >= half[0] && t <= half[1]);
}

export interface PriceThresholds {
  steps: [number, number][];
}

// Таза сатып алулардың барлық қатысушыларға үлесі бойынша бағаның өзгерісі (таңбасымен)
export function priceDelta(netTransfersIn: number, totalManagers: number, t: PriceThresholds): number {
  if (totalManagers <= 0) return 0;
  const share = Math.abs(netTransfersIn) / totalManagers;
  const step = [...t.steps].sort((a, b) => b[0] - a[0]).find(([threshold]) => share >= threshold);
  return step ? Math.sign(netTransfersIn) * step[1] : 0;
}

export function clampPrice(price: number): number {
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, price));
}
