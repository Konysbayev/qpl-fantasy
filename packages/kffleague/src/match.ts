// kffleague.kz матч бетін ядроның MatchFacts түріне айналдырады.
import type { LineupPlayer, MatchEvent, MatchFacts, MatchStatus, Position, TeamRef } from '../../core/src/types.js';
import { ParseError, extractFlightText, findJsonValues, readJsonAt } from './flight.js';

export { ParseError } from './flight.js';

type Raw = Record<string, unknown>;

// Next.js "$undefined" жолын null-ға айналдырады
const val = (v: unknown): unknown => (v === '$undefined' || v === undefined ? null : v);
const num = (v: unknown): number | null => (typeof val(v) === 'number' ? (v as number) : null);
const str = (v: unknown): string | null => (typeof val(v) === 'string' && v !== '' ? (v as string) : null);

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const STATUSES: MatchStatus[] = ['upcoming', 'live', 'finished'];

function team(raw: unknown): TeamRef {
  const t = (raw ?? {}) as Raw;
  const sourceId = num(t.id);
  if (sourceId === null) throw new ParseError('У команды нет id');
  return { sourceId, name: str(t.name) ?? '', nameKz: str(t.name_kz), logoUrl: str(t.logo_url) };
}

function findMatchObject(text: string, matchId: number): Raw {
  const needle = `{"id":${matchId},"date":"`;
  let i = text.indexOf(needle);
  while (i !== -1) {
    const o = readJsonAt(text, i) as Raw;
    if ('season_id' in o && 'home_team' in o) return o;
    i = text.indexOf(needle, i + 1);
  }
  throw new ParseError(`На странице нет матча с id ${matchId}`);
}

// Фото тек лига сайтынан қабылданады
const photo = (v: unknown): string | null => {
  const url = str(v);
  return url && url.startsWith('https://kffleague.kz/') ? url : null;
};

function lineupPlayers(side: Raw | undefined, teamSourceId: number): LineupPlayer[] {
  if (!side) return [];
  const toPlayer = (raw: unknown, starter: boolean): LineupPlayer | null => {
    const p = raw as Raw;
    const sourceId = num(p.player_id);
    if (sourceId === null) return null;
    const pos = str(p.position);
    return {
      sourceId,
      firstName: str(p.first_name) ?? '',
      lastName: str(p.last_name) ?? '',
      number: num(p.number),
      position: POSITIONS.includes(pos as Position) ? (pos as Position) : null,
      teamSourceId,
      starter,
      isCaptain: p.is_captain === true,
      photoUrl: photo(p.photo_url)
    };
  };
  const starters = Array.isArray(side.starters) ? side.starters : [];
  const subs = Array.isArray(side.substitutes) ? side.substitutes : [];
  return [...starters.map((p) => toPlayer(p, true)), ...subs.map((p) => toPlayer(p, false))].filter((p): p is LineupPlayer => p !== null);
}

// Кейде оқиғада player_id жоқ, тек нөмір бар: ойыншыны құрамнан команда мен нөмір бойынша табамыз
type Resolve = (id: unknown, number: unknown, teamSourceId: number | null) => number | null;
type Opponent = (teamSourceId: number) => number;

function toEvent(e: Raw, resolve: Resolve, opponent: Opponent): MatchEvent {
  const minute = num(e.minute);
  const teamSourceId = num(e.team_id);
  const playerSourceId = resolve(e.player_id, e.player_number, teamSourceId);
  const half = num(e.half) ?? undefined;
  const type = String(e.event_type);
  const unknown: MatchEvent = { kind: 'unknown', minute, rawType: type };
  if (minute === null || teamSourceId === null || playerSourceId === null) return unknown;
  switch (type) {
    case 'goal':
    case 'penalty':
    case 'own_goal': {
      const kind = type === 'goal' ? 'goal' : type === 'penalty' ? 'penalty_goal' : 'own_goal';
      return { kind, minute, half, teamSourceId, playerSourceId, assistSourceId: resolve(e.assist_player_id, e.assist_player_number, teamSourceId) };
    }
    case 'missed_penalty':
      // player2 — қарсылас командасының қақпашысы
      return { kind: 'penalty_missed', minute, half, teamSourceId, playerSourceId, savedBySourceId: resolve(e.player2_id, e.player2_number, opponent(teamSourceId)) };
    case 'yellow_card':
      return { kind: 'yellow', minute, half, teamSourceId, playerSourceId };
    case 'second_yellow':
      return { kind: 'second_yellow', minute, half, teamSourceId, playerSourceId };
    case 'red_card':
      return { kind: 'red', minute, half, teamSourceId, playerSourceId };
    case 'substitution': {
      // player_id — алаңнан шыққан, player2_id — алаңға кірген
      const inSourceId = resolve(e.player2_id, e.player2_number, teamSourceId);
      return inSourceId === null ? unknown : { kind: 'sub', minute, half, teamSourceId, outSourceId: playerSourceId, inSourceId };
    }
    default:
      return unknown;
  }
}

export function parseMatchPage(html: string, matchId: number): MatchFacts {
  const text = extractFlightText(html);
  const m = findMatchObject(text, matchId);
  const home = team(m.home_team);
  const away = team(m.away_team);
  const status = str(m.status);

  const lineupsRaw = findJsonValues(text, 'lineups').find(
    (l) => ((l as Raw)?.home_team as Raw | undefined)?.team_id === home.sourceId
  ) as Raw | undefined;
  const lineups = lineupsRaw
    ? [...lineupPlayers(lineupsRaw.home_team as Raw, home.sourceId), ...lineupPlayers(lineupsRaw.away_team as Raw, away.sourceId)]
    : [];

  const resolve: Resolve = (id, number, teamSourceId) =>
    num(id) ?? lineups.find((p) => p.teamSourceId === teamSourceId && p.number !== null && p.number === num(number))?.sourceId ?? null;

  // Оқиғалар бетте екі рет кездесуі мүмкін: id бойынша қайталанбайтындарын аламыз
  const seen = new Set<unknown>();
  const events: MatchEvent[] = [];
  for (const arr of findJsonValues(text, 'events')) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr as Raw[]) {
      if (!e || typeof e !== 'object' || !('event_type' in e)) continue;
      const key = e.id ?? JSON.stringify(e);
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(toEvent(e, resolve, (t) => (t === home.sourceId ? away.sourceId : home.sourceId)));
    }
  }

  return {
    sourceId: matchId,
    seasonSourceId: num(m.season_id) ?? 0,
    tour: num(m.tour),
    kickoff: `${str(m.date)}T${str(m.time) ?? '00:00'}:00+05:00`,
    status: STATUSES.includes(status as MatchStatus) ? (status as MatchStatus) : 'other',
    home,
    away,
    homeScore: num(m.home_score),
    awayScore: num(m.away_score),
    lineups,
    events
  };
}
