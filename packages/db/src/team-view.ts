// «Менің командам» экранына керектің бәрі: ашық турдың құрамы мен дедлайны, банк, тегін трансферлер, соңғы турдың ұпайы.
import type postgres from 'postgres';
import { canUseWildcard } from '../../core/src/squad.js';
import { scoreGameweekTeam, type Pick, type PlayerGameweek } from '../../core/src/team-score.js';
import type { TeamPick, TeamView } from '../../core/src/api-types.js';
import type { Position } from '../../core/src/types.js';
import { activeSeasonId, currentGameweek, ensureSquad } from './squad.js';

export type { TeamPick, TeamView };

type SquadRow = { id: string; bank: number; free_transfers: number; chip: string | null; gameweek_id: string; number: number; deadline: Date };

export async function loadTeamView(sql: postgres.Sql, userId: string, now: Date): Promise<TeamView> {
  const seasonId = await activeSeasonId(sql);
  const empty: TeamView = { next: null, last: null, squad: null, picks: [] };
  if (!seasonId) return empty;
  const next = await currentGameweek(sql, seasonId, now);
  const [lastGw] = await sql<{ id: string; number: number }[]>`select id, number from gameweeks
    where season_id = ${seasonId} and deadline <= ${now} order by deadline desc limit 1`;

  // Ашық тур мен өткен тур үшін құрамдар (керек болса, алдыңғысынан көшіріледі)
  if (next) await ensureSquad(sql, userId, next.id);
  if (lastGw) await ensureSquad(sql, userId, lastGw.id);
  const squads = await sql<SquadRow[]>`select s.id, s.bank, s.free_transfers, s.chip, s.gameweek_id, g.number, g.deadline
    from squads s join gameweeks g on g.id = s.gameweek_id where s.user_id = ${userId} and g.season_id = ${seasonId}`;
  const nextSquad = next ? squads.find((s) => s.gameweek_id === next.id) : undefined;
  const lastSquad = lastGw ? squads.find((s) => s.gameweek_id === lastGw.id) : undefined;
  const shown = nextSquad ?? lastSquad;

  const view: TeamView = { ...empty, next: next ? { id: next.id, number: next.number, deadline: next.deadline.toISOString() } : null };
  // Ұпай тек көрсетілетін екі құрамның ойыншыларына есептеледі
  const shownIds = [nextSquad?.id, lastSquad?.id].filter((x): x is string => Boolean(x));
  const points = lastGw ? await gameweekPoints(sql, lastGw.id, shownIds) : null;

  if (lastGw && points) {
    const [{ unfinished }] = await sql<{ unfinished: number }[]>`select count(*)::int as unfinished from fixtures
      where gameweek_id = ${lastGw.id} and status <> 'finished'`;
    view.last = { number: lastGw.number, status: unfinished > 0 ? 'live' : 'finished', points: null, penalty: 0, captainId: null, subsIn: [] };
    if (lastSquad) {
      const picks = await sql<Pick[]>`select player_id as "playerId", slot, is_captain as "isCaptain", is_vice as "isVice"
        from squad_picks where squad_id = ${lastSquad.id}`;
      const score = scoreGameweekTeam(picks, new Map(picks.map((p) => [p.playerId, points.get(p.playerId)!])));
      Object.assign(view.last, { points: score.total, captainId: score.captainId, subsIn: score.subsIn, penalty: await penaltyOf(sql, userId, lastGw.id) });
    }
  }

  if (shown) {
    const rows = await sql<(Omit<TeamPick, 'points'>)[]>`
      select sp.player_id as "playerId", sp.slot, sp.is_captain as "isCaptain", sp.is_vice as "isVice", p.first_name as "firstName",
             p.last_name as "lastName", p.position, p.club_id as "clubId", p.price
      from squad_picks sp join players p on p.id = sp.player_id where sp.squad_id = ${shown.id} order by sp.slot`;
    view.picks = rows.map((r) => ({ ...r, points: points ? (points.get(r.playerId)?.points ?? 0) : null }));

    // Пайдаланушының алғашқы туры (нөмірі емес, дедлайны бойынша: ауыстырылған турлар бар)
    const [first] = squads.slice().sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
    const used = squads.filter((s) => s.chip === 'wildcard').map((s) => s.number);
    view.squad = {
      gameweek: shown.number,
      bank: shown.bank,
      freeTransfers: shown.free_transfers,
      unlimited: first?.gameweek_id === shown.gameweek_id,
      wildcardActive: shown.chip === 'wildcard',
      wildcardAvailable: shown.chip !== 'wildcard' && canUseWildcard(shown.number, used),
      penalty: await penaltyOf(sql, userId, shown.gameweek_id)
    };
  }
  return view;
}

async function penaltyOf(sql: postgres.Sql, userId: string, gameweekId: string): Promise<number> {
  const [r] = await sql<{ p: number }[]>`select coalesce(sum(penalty), 0)::int as p from transfers where user_id = ${userId} and gameweek_id = ${gameweekId}`;
  return r.p;
}

// Турдағы әр ойыншының ұпайы (қос турда — қосындысы). Клубы әлі ойнап бітпеген ойыншы «ойнады» саналады: автоауыстыру тур соңында
export async function gameweekPoints(sql: postgres.Sql, gameweekId: string, squadIds: string[]): Promise<Map<string, PlayerGameweek>> {
  const rows = await sql<{ id: string; position: Position; points: number; played: boolean; pending: boolean }[]>`
    select p.id, p.position,
           coalesce((select sum(s.points) from player_match_stats s join fixtures f on f.id = s.fixture_id
                     where s.player_id = p.id and f.gameweek_id = ${gameweekId}), 0)::int as points,
           exists (select 1 from player_match_stats s join fixtures f on f.id = s.fixture_id
                   where s.player_id = p.id and f.gameweek_id = ${gameweekId} and s.minutes > 0) as played,
           exists (select 1 from fixtures f where f.gameweek_id = ${gameweekId} and f.status <> 'finished'
                   and p.club_id in (f.home_club_id, f.away_club_id)) as pending
    from players p
    where p.id in (select player_id from squad_picks where squad_id = any(${squadIds}::uuid[]))`;
  return new Map(rows.map((r) => [r.id, { position: r.position, points: r.points, played: r.played || r.pending }]));
}
