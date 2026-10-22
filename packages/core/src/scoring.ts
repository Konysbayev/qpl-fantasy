// Ойыншының бір матчтағы ұпайлары, маусым ережелері бойынша, жолма-жол түсіндірмесімен.
import type { ScoringRules } from './rules.js';
import type { PlayerMatchStat, Position } from './types.js';

export interface PointsLine {
  code: 'appearance' | 'goal' | 'assist' | 'clean_sheet' | 'conceded' | 'penalty_saved' | 'penalty_missed' | 'yellow' | 'red' | 'own_goal';
  points: number;
}

export interface PlayerPoints {
  total: number;
  lines: PointsLine[];
}

export function scorePlayer(stat: PlayerMatchStat, position: Position, rules: ScoringRules): PlayerPoints {
  if (stat.minutes <= 0) return { total: 0, lines: [] };
  const full = stat.minutes >= rules.cleanSheetMinMinutes;
  const raw: PointsLine[] = [
    { code: 'appearance', points: full ? rules.appearance.from60 : rules.appearance.under60 },
    { code: 'goal', points: stat.goals * rules.goal[position] },
    { code: 'assist', points: stat.assists * rules.assist },
    { code: 'clean_sheet', points: full && stat.conceded === 0 ? rules.cleanSheet[position] : 0 },
    { code: 'conceded', points: Math.floor(stat.conceded / 2) * rules.concededPer2[position] },
    { code: 'penalty_saved', points: stat.penaltiesSaved * rules.penaltySaved },
    { code: 'penalty_missed', points: stat.penaltiesMissed * rules.penaltyMissed },
    { code: 'yellow', points: stat.yellow * rules.yellow },
    { code: 'red', points: stat.red * rules.red },
    { code: 'own_goal', points: stat.ownGoals * rules.ownGoal }
  ];
  const lines = raw.filter((l) => l.points !== 0);
  return { total: lines.reduce((s, l) => s + l.points, 0), lines };
}
