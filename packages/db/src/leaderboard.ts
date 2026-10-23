// Жалпы рейтинг: соңғы есептелген турдағы барлық қатысушының орны мен ұпайы (gameweek_scores, cron-tick жазады).
import type postgres from 'postgres';
import { activeSeasonId } from './squad.js';

export interface LeaderRow {
  rank: number;
  // null — атау әлі таңдалмаған (қосымша «Атаусыз команда» деп көрсетеді)
  teamName: string | null;
  // Тур ұпайы айыппұлмен бірге
  gwPoints: number;
  total: number;
  me: boolean;
}

export interface Leaderboard {
  gameweek: number | null;
  status: string | null;
  total: number;
  rows: LeaderRow[];
  me: LeaderRow | null;
}

export async function loadLeaderboard(sql: postgres.Sql, userId: string, page: { offset: number; limit: number }): Promise<Leaderboard> {
  const empty: Leaderboard = { gameweek: null, status: null, total: 0, rows: [], me: null };
  const seasonId = await activeSeasonId(sql);
  if (!seasonId) return empty;
  const [gw] = await sql<{ id: string; number: number; status: string }[]>`select g.id, g.number, g.status from gameweeks g
    where g.season_id = ${seasonId} and exists (select 1 from gameweek_scores s where s.gameweek_id = g.id)
    order by g.deadline desc limit 1`;
  if (!gw) return empty;

  const select = (where: postgres.PendingQuery<postgres.Row[]>) => sql<LeaderRow[]>`
    select gs.rank, u.team_name as "teamName", (gs.points + gs.penalty) as "gwPoints", gs.season_total as total, (u.id = ${userId}) as me
    from gameweek_scores gs join users u on u.id = gs.user_id
    where gs.gameweek_id = ${gw.id} ${where}
    order by gs.rank, u.created_at, u.id`;
  const rows = await sql<LeaderRow[]>`
    select gs.rank, u.team_name as "teamName", (gs.points + gs.penalty) as "gwPoints", gs.season_total as total, (u.id = ${userId}) as me
    from gameweek_scores gs join users u on u.id = gs.user_id
    where gs.gameweek_id = ${gw.id}
    order by gs.rank, u.created_at, u.id
    offset ${page.offset} limit ${page.limit}`;
  const [me] = await select(sql`and u.id = ${userId}`);
  const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from gameweek_scores where gameweek_id = ${gw.id}`;
  return { gameweek: gw.number, status: gw.status, total, rows, me: me ?? null };
}
