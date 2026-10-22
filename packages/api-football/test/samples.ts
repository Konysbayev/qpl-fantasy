// API-Football жауаптарына ұқсас жасанды үлгілер (тек тесттер үшін)
import type { EventEntry, FixtureEntry, LeagueEntry, PlayerStat, SeasonEntry, TeamPlayers } from '../src/types.js';

const season = (year: number, current: boolean): SeasonEntry => ({
  year,
  start: `${year}-03-07`,
  end: `${year}-11-01`,
  current,
  coverage: {
    fixtures: { events: true, lineups: true, statistics_fixtures: true, statistics_players: true },
    standings: true,
    players: true,
    injuries: false
  }
});

const league = (id: number, name: string, type: string, seasons: SeasonEntry[] = [season(2026, true)]): LeagueEntry => ({
  league: { id, name, type },
  country: { name: 'Kazakhstan' },
  seasons
});

export const kazLeagues: LeagueEntry[] = [
  league(390, 'First Division', 'League'),
  league(391, 'Cup', 'Cup'),
  league(389, 'Premier League', 'League', [season(2025, false), season(2026, true)]),
  league(392, 'Super Cup', 'Cup')
];

export const kpl = kazLeagues[2];

export function stat(over: { minutes?: number | null; position?: string; rating?: string | null; saves?: number | null; conceded?: number | null } = {}): PlayerStat {
  return {
    games: { minutes: 'minutes' in over ? over.minutes! : 90, position: over.position ?? 'M', rating: 'rating' in over ? over.rating! : '7.1' },
    goals: { total: null, conceded: 'conceded' in over ? over.conceded! : null, assists: null, saves: 'saves' in over ? over.saves! : null },
    cards: { yellow: 0, red: 0 },
    penalty: { saved: null, missed: null }
  };
}

let nextPlayerId = 1;
const player = (s: PlayerStat) => ({ player: { id: nextPlayerId++, name: `Player ${nextPlayerId}` }, statistics: [s] });

// Бір команда: вратарь + 10 ойыншы негізгі құрамда, 1 ауыстыру, 1 алаңға шықпаған запас.
// Ойнағандардың жартысында рейтинг жоқ (null).
function team(id: number, name: string): TeamPlayers {
  const played = [
    player(stat({ position: 'G', saves: 3, conceded: 1, rating: '7.4' })),
    ...Array.from({ length: 10 }, (_, i) => player(stat({ position: i < 4 ? 'D' : i < 8 ? 'M' : 'F', rating: i < 5 ? null : '6.8' }))),
    player(stat({ minutes: 20, position: 'F', rating: null }))
  ];
  const bench = player(stat({ minutes: null, position: 'D', rating: null }));
  return { team: { id, name }, players: [...played, bench] };
}

const ev = (type: string, detail: string, assistId: number | null = null): EventEntry => ({
  type,
  detail,
  player: { id: 1 },
  assist: { id: assistId }
});

export const finishedFixture: FixtureEntry = {
  fixture: { id: 1001, date: '2026-09-20T15:00:00+00:00', status: { short: 'FT' } },
  teams: { home: { id: 10, name: 'Kairat' }, away: { id: 20, name: 'Astana' } },
  goals: { home: 2, away: 1 },
  events: [
    ev('Goal', 'Normal Goal', 7),
    ev('Goal', 'Penalty'),
    ev('Goal', 'Own Goal'),
    ev('Goal', 'Missed Penalty'),
    ev('Card', 'Yellow Card'),
    ev('Card', 'Yellow Card'),
    ev('Card', 'Red Card'),
    ev('subst', 'Substitution 1'),
    ev('subst', 'Substitution 2'),
    ev('subst', 'Substitution 3'),
    ev('subst', 'Substitution 4')
  ],
  lineups: [{ team: { id: 10 } }, { team: { id: 20 } }],
  players: [team(10, 'Kairat'), team(20, 'Astana')]
};
