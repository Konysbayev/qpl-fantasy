// API-Football жауаптарына ұқсас жасанды үлгілер (тек тесттер үшін).
// Нақты API сияқты: санауыштар нөл болғанда null келеді (гол, ассист, сейв).
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

interface StatOver {
  minutes?: number | null;
  position?: string;
  rating?: string | null;
  saves?: number | null;
  conceded?: number | null;
  assists?: number | null;
  yellow?: number;
  red?: number;
}

export function stat(over: StatOver = {}): PlayerStat {
  const pick = <K extends keyof StatOver>(k: K, d: StatOver[K]) => (k in over ? over[k] : d);
  return {
    games: { minutes: pick('minutes', 90) ?? null, position: over.position ?? 'M', rating: pick('rating', '7.1') ?? null },
    goals: { total: null, conceded: pick('conceded', 0) ?? null, assists: pick('assists', null) ?? null, saves: pick('saves', null) ?? null },
    cards: { yellow: over.yellow ?? 0, red: over.red ?? 0 },
    penalty: { saved: null, missed: null }
  };
}

let nextPlayerId = 1;
const player = (s: PlayerStat) => ({ player: { id: nextPlayerId++, name: `Player ${nextPlayerId}` }, statistics: [s] });

// Бір команда: вратарь + 10 ойыншы негізгі құрамда, 1 ауыстыру, 1 алаңға шықпаған запас.
// Ойнағандардың жартысында рейтинг жоқ (null). extra — бірінші далалық ойыншыға қосымша өрістер.
function team(id: number, name: string, keeper: StatOver, extra: StatOver[]): TeamPlayers {
  const played = [
    player(stat({ position: 'G', rating: '7.4', ...keeper })),
    ...Array.from({ length: 10 }, (_, i) =>
      player(stat({ position: i < 4 ? 'D' : i < 8 ? 'M' : 'F', rating: i < 5 ? null : '6.8', ...(extra[i] ?? {}) }))
    ),
    player(stat({ minutes: 20, position: 'F', rating: null }))
  ];
  const bench = player(stat({ minutes: null, position: 'D', rating: null, conceded: null }));
  return { team: { id, name }, players: [...played, bench] };
}

const ev = (type: string, detail: string, assistId: number | null = null): EventEntry => ({
  type,
  detail,
  player: { id: 1 },
  assist: { id: assistId }
});

// Ұпайы 2:1 → барлығы 3 гол өткізілді: үй вратары 1, қонақ вратары 2.
// Оқиғаларда 2 сары, 1 қызыл; ойыншы статистикасында да солай. Ассист: оқиғада 1, статистикада 1.
// Команда статистикасындағы «Goalkeeper Saves» = 3 + 2, вратарлардың сейвтері де 3 және 2.
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
  statistics: [
    { team: { id: 10, name: 'Kairat' }, statistics: [{ type: 'Goalkeeper Saves', value: 3 }] },
    { team: { id: 20, name: 'Astana' }, statistics: [{ type: 'Goalkeeper Saves', value: 2 }] }
  ],
  players: [
    team(10, 'Kairat', { saves: 3, conceded: 1 }, [{ assists: 1, yellow: 1 }, { yellow: 1 }]),
    team(20, 'Astana', { saves: 2, conceded: 2 }, [{ red: 1 }])
  ]
};
