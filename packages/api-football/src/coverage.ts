// API жауаптарын талдау: ҚПЛ-ді табу, маусым қамтуы, матч деректерінің толықтығы.
import type { FixtureEntry, LeagueEntry, PlayerStat, TeamPlayers } from './types.js';

export interface SeasonCoverage {
  year: number;
  current: boolean;
  start: string;
  end: string;
  events: boolean;
  lineups: boolean;
  fixtureStats: boolean;
  playerStats: boolean;
  injuries: boolean;
}

export interface FixtureAssessment {
  fixtureId: number;
  label: string;
  status: string;
  bundled: boolean;
  lineups: boolean;
  goalEvents: number;
  goalEventsWithAssist: number;
  cardEvents: number;
  substEvents: number;
  playersWithMinutes: number;
  rates: { minutes: number; rating: number; assistsField: number; savesGk: number; conceded: number; cards: number };
}

const PLAYERS_PER_TEAM = 11;

export function findKpl(leagues: LeagueEntry[]): LeagueEntry | undefined {
  return leagues.find((l) => l.country.name === 'Kazakhstan' && l.league.type === 'League' && /premier/i.test(l.league.name));
}

export function seasonCoverage(entry: LeagueEntry, year: number): SeasonCoverage | undefined {
  const s = entry.seasons.find((x) => x.year === year);
  if (!s) return undefined;
  const f = s.coverage.fixtures;
  return {
    year: s.year,
    current: s.current,
    start: s.start,
    end: s.end,
    events: f.events,
    lineups: f.lineups,
    fixtureStats: f.statistics_fixtures,
    playerStats: f.statistics_players,
    injuries: s.coverage.injuries
  };
}

const ratio = (num: number, den: number) => (den === 0 ? 0 : num / den);

export function assessFixture(detail: FixtureEntry, players: TeamPlayers[] | null): FixtureAssessment {
  const events = detail.events ?? [];
  const teams = players ?? detail.players ?? [];
  // Өз қақпасына соғылған гол мен соғылмаған пенальти ассист санауына кірмейді
  const goals = events.filter((e) => e.type === 'Goal' && e.detail !== 'Own Goal' && e.detail !== 'Missed Penalty');

  // Тек алаңға шыққан ойыншылар есептеледі
  const played: PlayerStat[] = teams
    .flatMap((t) => t.players.map((p) => p.statistics[0]))
    .filter((s): s is PlayerStat => s !== undefined && (s.games.minutes ?? 0) > 0);
  const keepers = played.filter((s) => s.games.position === 'G');
  const count = (list: PlayerStat[], has: (s: PlayerStat) => boolean) => list.filter(has).length;

  return {
    fixtureId: detail.fixture.id,
    label: `${detail.teams.home.name} – ${detail.teams.away.name} ${detail.goals.home ?? '-'}:${detail.goals.away ?? '-'}`,
    status: detail.fixture.status.short,
    bundled: events.length > 0 && (detail.lineups?.length ?? 0) > 0 && (detail.players?.length ?? 0) > 0,
    lineups: (detail.lineups?.length ?? 0) > 0,
    goalEvents: goals.length,
    goalEventsWithAssist: goals.filter((e) => e.assist.id !== null).length,
    cardEvents: events.filter((e) => e.type === 'Card').length,
    substEvents: events.filter((e) => e.type === 'subst').length,
    playersWithMinutes: played.length,
    rates: {
      minutes: Math.min(1, ratio(played.length, PLAYERS_PER_TEAM * teams.length)),
      rating: ratio(count(played, (s) => s.games.rating !== null), played.length),
      assistsField: ratio(count(played, (s) => s.goals.assists !== null), played.length),
      savesGk: ratio(count(keepers, (s) => s.goals.saves !== null), keepers.length),
      conceded: ratio(count(keepers, (s) => s.goals.conceded !== null), keepers.length),
      cards: ratio(count(played, (s) => s.cards.yellow !== null && s.cards.red !== null), played.length)
    }
  };
}
