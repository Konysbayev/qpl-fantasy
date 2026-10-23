// Тур күйлері (спецификация 7) және командалардың ұпайлары: автоауыстыру, капитан, айыппұл, маусым сомасы мен орын.
import type postgres from 'postgres';
import { scoreGameweekTeam, type Pick } from '../../core/src/team-score.js';
import { ensureSquadTx } from './squad.js';
import { gameweekPoints } from './team-view.js';

export type GwStatus = 'upcoming' | 'open' | 'live' | 'played' | 'closed';

const H = 3_600_000;
// Соңғы матч басталғаннан кейін: 26 сағат — «ойналды» күйі (ойын + 24 сағат), 48 сағат — ілініп қалған матчқа қарамай жабу
const CLOSE_AFTER_MS = 26 * H;
const STUCK_AFTER_MS = 48 * H;

export function gameweekPhase(g: { deadline: Date; fixtures: { kickoff: Date; status: string }[] }, now: Date): Exclude<GwStatus, 'upcoming'> {
  if (g.deadline.getTime() > now.getTime()) return 'open';
  const last = Math.max(g.deadline.getTime(), ...g.fixtures.map((f) => f.kickoff.getTime()));
  const since = now.getTime() - last;
  if (g.fixtures.some((f) => f.status !== 'finished')) return since < STUCK_AFTER_MS ? 'live' : 'closed';
  return since < CLOSE_AFTER_MS ? 'played' : 'closed';
}

// Турдың барлық қатысушысының ұпайы нөлден есептеледі (қайта шақыру қауіпсіз)
export async function scoreGameweek(sql: postgres.Sql, gameweekId: string): Promise<{ scored: number }> {
  const [gw] = await sql<{ season_id: string; deadline: Date }[]>`select season_id, deadline from gameweeks where id = ${gameweekId}`;
  if (!gw) throw new Error(`Нет тура ${gameweekId}`);
  const users = await sql<{ user_id: string }[]>`select distinct s.user_id from squads s join gameweeks g on g.id = s.gameweek_id
    where g.season_id = ${gw.season_id} and g.deadline <= ${gw.deadline}`;

  // Тур өткізіп алған қатысушының құрамы алдыңғы турдан көшіріледі
  const squads: { userId: string; squadId: string }[] = [];
  for (const { user_id } of users) {
    const squadId = await sql.begin((tx) => ensureSquadTx(tx, user_id, gameweekId));
    if (squadId) squads.push({ userId: user_id, squadId });
  }
  const points = await gameweekPoints(sql, gameweekId, squads.map((s) => s.squadId));
  const picks = await sql<(Pick & { squadId: string })[]>`select squad_id as "squadId", player_id as "playerId", slot, is_captain as "isCaptain", is_vice as "isVice"
    from squad_picks where squad_id = any(${squads.map((s) => s.squadId)}::uuid[])`;
  const penalties = new Map(
    (await sql<{ user_id: string; penalty: number }[]>`select user_id, sum(penalty)::int as penalty from transfers
      where gameweek_id = ${gameweekId} group by user_id`).map((r) => [r.user_id, r.penalty])
  );

  await sql.begin(async (tx) => {
    for (const s of squads) {
      const mine = picks.filter((p) => p.squadId === s.squadId);
      const total = scoreGameweekTeam(mine, points).total;
      await tx`insert into gameweek_scores (user_id, gameweek_id, points, penalty) values (${s.userId}, ${gameweekId}, ${total}, ${penalties.get(s.userId) ?? 0})
        on conflict (user_id, gameweek_id) do update set points = excluded.points, penalty = excluded.penalty`;
    }
    // Маусым сомасы осы турға дейінгі барлық турлар бойынша; тең болса — ақылы трансфері азырақ жоғары (спецификация 4.4)
    await tx`
      with totals as (
        select gs.user_id,
               (select coalesce(sum(x.points + x.penalty), 0) from gameweek_scores x join gameweeks g on g.id = x.gameweek_id
                where x.user_id = gs.user_id and g.season_id = ${gw.season_id} and g.deadline <= ${gw.deadline})::int as total,
               (select count(*) from transfers t join gameweeks g on g.id = t.gameweek_id
                where t.user_id = gs.user_id and t.penalty < 0 and g.season_id = ${gw.season_id} and g.deadline <= ${gw.deadline})::int as paid
        from gameweek_scores gs where gs.gameweek_id = ${gameweekId}
      ), ranked as (select user_id, total, rank() over (order by total desc, paid asc) as rank from totals)
      update gameweek_scores gs set season_total = r.total, rank = r.rank
      from ranked r where gs.user_id = r.user_id and gs.gameweek_id = ${gameweekId}`;
  });
  return { scored: squads.length };
}

export interface Transition {
  gameweekId: string;
  number: number;
  from: GwStatus;
  to: GwStatus;
}

// Дедлайны өткен, әлі жабылмаған турлар: күйі жаңарады және ұпайлары қайта есептеледі
export async function advanceGameweeks(sql: postgres.Sql, seasonId: string, now: Date): Promise<Transition[]> {
  const gws = await sql<{ id: string; number: number; deadline: Date; status: GwStatus }[]>`
    select id, number, deadline, status from gameweeks
    where season_id = ${seasonId} and deadline is not null and deadline <= ${now} and status <> 'closed' order by deadline`;
  const out: Transition[] = [];
  for (const g of gws) {
    const fixtures = await sql<{ id: string; kickoff: Date; status: string }[]>`select id, kickoff, status from fixtures where gameweek_id = ${g.id}`;
    const to = gameweekPhase({ deadline: g.deadline, fixtures }, now);
    await scoreGameweek(sql, g.id);
    if (to === g.status) continue;
    await sql`update gameweeks set status = ${to} where id = ${g.id}`;
    const stuck = fixtures.filter((f) => f.status !== 'finished').map((f) => f.id);
    if (to === 'closed' && stuck.length > 0) {
      await sql`insert into audit_log (action, payload) values ('fixture_stuck', ${sql.json({ gameweek: g.number, fixtureIds: stuck })})`;
    }
    out.push({ gameweekId: g.id, number: g.number, from: g.status, to });
  }
  return out;
}
