// API-Football v3 жауаптарының тек біз қолданатын өрістері.

export interface TeamRef {
  id: number;
  name: string;
}

export interface SeasonEntry {
  year: number;
  start: string;
  end: string;
  current: boolean;
  coverage: {
    fixtures: { events: boolean; lineups: boolean; statistics_fixtures: boolean; statistics_players: boolean };
    standings: boolean;
    players: boolean;
    injuries: boolean;
  };
}

export interface LeagueEntry {
  league: { id: number; name: string; type: string };
  country: { name: string };
  seasons: SeasonEntry[];
}

export interface EventEntry {
  type: string;
  detail: string;
  player: { id: number | null };
  assist: { id: number | null };
}

export interface PlayerStat {
  games: { minutes: number | null; position: string | null; rating: string | null };
  goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null };
  cards: { yellow: number | null; red: number | null };
  penalty: { saved: number | null; missed: number | null };
}

export interface TeamPlayers {
  team: TeamRef;
  players: { player: { id: number; name: string }; statistics: PlayerStat[] }[];
}

export interface FixtureEntry {
  fixture: { id: number; date: string; status: { short: string } };
  league?: { id: number };
  teams: { home: TeamRef; away: TeamRef };
  goals: { home: number | null; away: number | null };
  events?: EventEntry[];
  lineups?: unknown[];
  players?: TeamPlayers[];
}

export interface StatusInfo {
  subscription: { plan: string };
  requests: { current: number; limit_day: number };
}
