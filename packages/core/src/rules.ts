// Ұпай ережелері: маусым баптауында JSON ретінде сақталады, мұнда тек әдепкі мәндер (спецификация 4.4).
import type { Position } from './types.js';

type ByPos = Record<Position, number>;

export interface ScoringRules {
  appearance: { under60: number; from60: number };
  goal: ByPos;
  assist: number;
  cleanSheet: ByPos;
  cleanSheetMinMinutes: number;
  concededPer2: ByPos;
  penaltySaved: number;
  penaltyMissed: number;
  yellow: number;
  red: number;
  ownGoal: number;
  // null — ереже өшірулі (сейвтер мен рейтинг көзде жоқ)
  savesPer3: number | null;
  ratingBonus: [number, number, number] | null;
}

export const DEFAULT_RULES: ScoringRules = {
  appearance: { under60: 1, from60: 2 },
  goal: { GK: 6, DEF: 6, MID: 5, FWD: 4 },
  assist: 3,
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
  cleanSheetMinMinutes: 60,
  concededPer2: { GK: -1, DEF: -1, MID: 0, FWD: 0 },
  penaltySaved: 5,
  penaltyMissed: -2,
  yellow: -1,
  red: -3,
  ownGoal: -2,
  savesPer3: null,
  ratingBonus: null
};
