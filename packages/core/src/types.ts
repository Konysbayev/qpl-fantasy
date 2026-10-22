// Ойын ядросының типтері: дерек көзіне тәуелсіз матч фактілері және ойыншының матчтағы статистикасы.

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface TeamRef {
  sourceId: number;
  name: string;
  nameKz: string | null;
  logoUrl: string | null;
}

export interface LineupPlayer {
  sourceId: number;
  firstName: string;
  lastName: string;
  number: number | null;
  position: Position | null;
  teamSourceId: number;
  starter: boolean;
  isCaptain: boolean;
}

// half — тайм (1 немесе 2). Жоқ болса, минуттан шығарылады: 45-ке дейін — бірінші тайм
export type MatchEvent =
  | { kind: 'goal' | 'penalty_goal' | 'own_goal'; minute: number; half?: number; teamSourceId: number; playerSourceId: number; assistSourceId: number | null }
  | { kind: 'yellow' | 'second_yellow' | 'red'; minute: number; half?: number; teamSourceId: number; playerSourceId: number }
  | { kind: 'sub'; minute: number; half?: number; teamSourceId: number; outSourceId: number; inSourceId: number }
  // Соққыны орындаған ойыншы; savedBySourceId — қарсыластың қақпашысы (белгілі болса)
  | { kind: 'penalty_missed'; minute: number; half?: number; teamSourceId: number; playerSourceId: number; savedBySourceId: number | null }
  | { kind: 'unknown'; minute: number | null; rawType: string };

export type MatchStatus = 'upcoming' | 'live' | 'finished' | 'other';

export interface MatchFacts {
  sourceId: number;
  seasonSourceId: number;
  tour: number | null;
  kickoff: string;
  status: MatchStatus;
  home: TeamRef;
  away: TeamRef;
  homeScore: number | null;
  awayScore: number | null;
  // Құрамдар әлі жоқ болса, бос
  lineups: LineupPlayer[];
  events: MatchEvent[];
}

export interface PlayerMatchStat {
  playerSourceId: number;
  teamSourceId: number;
  position: Position | null;
  minutes: number;
  onMinute: number | null;
  offMinute: number | null;
  goals: number;
  assists: number;
  penaltyGoals: number;
  ownGoals: number;
  yellow: number;
  red: number;
  conceded: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
}

export interface MatchStatsResult {
  stats: PlayerMatchStat[];
  needsReview: string[];
}
