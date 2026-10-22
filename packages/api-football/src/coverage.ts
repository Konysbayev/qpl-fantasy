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
  assistableGoals: number;
  goalEventsWithAssist: number;
  cardEvents: number;
  substEvents: number;
  playersListed: number;
  playersWithMinutes: number;
  // null — бұл матчта салыстыратын ештеңе жоқ (мысалы, гол да, карточка да болмаған)
  rates: { minutes: number; rating: number | null; assistsField: number | null; savesGk: number | null; conceded: number | null; cards: number | null };
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
// Ойыншы статистикасының қосындысын тәуелсіз санмен салыстыру: API нөлді null деп береді, сондықтан null-дың үлесі емес, қосынды тексеріледі
const check = (sum: number, expected: number) => (expected === 0 ? null : Math.min(1, sum / expected));

export function assessFixture(detail: FixtureEntry, players: TeamPlayers[] | null): FixtureAssessment {
  const events = detail.events ?? [];
  const teams = players ?? detail.players ?? [];
  // Өз қақпасына соғылған гол мен соғылмаған пенальти голға саналмайды; пенальтиде ассист болмайды
  const goals = events.filter((e) => e.type === 'Goal' && e.detail !== 'Own Goal' && e.detail !== 'Missed Penalty');
  const assistable = goals.filter((e) => e.detail !== 'Penalty');
  const assisted = assistable.filter((e) => e.assist.id !== null).length;
  const cardEvents = events.filter((e) => e.type === 'Card').length;

  const listed = teams.flatMap((t) => t.players.map((p) => p.statistics[0])).filter((s): s is PlayerStat => s !== undefined);
  // Тек алаңға шыққан ойыншылар есептеледі
  const played = listed.filter((s) => (s.games.minutes ?? 0) > 0);
  const keepers = played.filter((s) => s.games.position === 'G');
  const sum = (list: PlayerStat[], get: (s: PlayerStat) => number | null) => list.reduce((acc, s) => acc + (get(s) ?? 0), 0);

  const teamSaves = (detail.statistics ?? []).flatMap((t) => t.statistics).filter((x) => x.type === 'Goalkeeper Saves');
  const goalsAgainst = (detail.goals.home ?? 0) + (detail.goals.away ?? 0);

  return {
    fixtureId: detail.fixture.id,
    label: `${detail.teams.home.name} – ${detail.teams.away.name} ${detail.goals.home ?? '-'}:${detail.goals.away ?? '-'}`,
    status: detail.fixture.status.short,
    bundled: events.length > 0 && (detail.lineups?.length ?? 0) > 0 && (detail.players?.length ?? 0) > 0,
    lineups: (detail.lineups?.length ?? 0) > 0,
    goalEvents: goals.length,
    assistableGoals: assistable.length,
    goalEventsWithAssist: assisted,
    cardEvents,
    substEvents: events.filter((e) => e.type === 'subst').length,
    playersListed: listed.length,
    playersWithMinutes: played.length,
    rates: {
      minutes: Math.min(1, ratio(played.length, PLAYERS_PER_TEAM * teams.length)),
      rating: played.length === 0 ? null : ratio(played.filter((s) => s.games.rating !== null).length, played.length),
      assistsField: played.length === 0 ? null : check(sum(played, (s) => s.goals.assists), assisted),
      savesGk: keepers.length === 0 ? null : check(sum(keepers, (s) => s.goals.saves), teamSaves.reduce((a, x) => a + (Number(x.value) || 0), 0)),
      conceded: keepers.length === 0 ? null : check(sum(keepers, (s) => s.goals.conceded), goalsAgainst),
      cards: played.length === 0 ? null : check(sum(played, (s) => (s.cards.yellow ?? 0) + (s.cards.red ?? 0)), cardEvents)
    }
  };
}
