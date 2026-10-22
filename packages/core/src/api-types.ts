// Сервер мен Mini App арасындағы ортақ типтер (тек типтер, тәуелділіксіз).
import type { Position } from './types.js';

export type SquadFailure = 'deadline_passed' | 'invalid_squad' | 'invalid_lineup' | 'not_owned' | 'wildcard_unavailable' | 'no_open_gameweek';
export type Result<T> = { ok: true; value: T } | { ok: false; error: SquadFailure; details?: string[] };

export interface PickInput {
  playerId: string;
  slot: number;
  isCaptain: boolean;
  isVice: boolean;
}

export interface TransferRequest {
  requestId: string;
  // Клиент өзгертіп отырған тур: ол жабылып қалса — deadline_passed
  gameweek: number;
  out: string[];
  in: string[];
  wildcard: boolean;
}

export interface TransferResult {
  penalty: number;
  freeLeft: number;
  bank: number;
}

export interface TeamPick {
  playerId: string;
  slot: number;
  isCaptain: boolean;
  isVice: boolean;
  firstName: string;
  lastName: string;
  position: Position;
  clubId: string;
  price: number;
  // Соңғы өткен турдағы ұпайы (капитан еселенбеген); тур әлі болмаса — null
  points: number | null;
}

export interface TeamView {
  next: { id: string; number: number; deadline: string } | null;
  last: { number: number; status: 'live' | 'finished'; points: number | null; penalty: number; captainId: string | null; subsIn: string[] } | null;
  squad: { gameweek: number; bank: number; freeTransfers: number; unlimited: boolean; wildcardActive: boolean; wildcardAvailable: boolean; penalty: number } | null;
  picks: TeamPick[];
}
