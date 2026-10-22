// Скриншоттарға арналған деректер: жергілікті «бұлт көшірмесінен» (qpl_cloud_sim) нақты маусыммен құрам жасап, JSON-ға шығарады.
// Іске қосу: npx tsx scripts/dev/screens-data.ts → apps/web/e2e/data.json (git-ке кірмейді)
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { createFirstSquad } from '../../packages/db/src/squad.js';
import { loadTeamView } from '../../packages/db/src/team-view.js';
import type { Position } from '../../packages/core/src/types.js';

const sql = postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/qpl_cloud_sim', { onnotice: () => {} });
const FIRST_GW = Number(process.env.FIRST_GW ?? 23);
const NOW = new Date(process.env.NOW ?? '2026-10-22T12:00:00Z');
const TG_ID = 900001;

await sql`delete from transfer_requests where user_id in (select id from users where telegram_id = ${TG_ID})`;
await sql`delete from transfers where user_id in (select id from users where telegram_id = ${TG_ID})`;
await sql`delete from squads where user_id in (select id from users where telegram_id = ${TG_ID})`;
const [user] = await sql<{ id: string }[]>`insert into users (telegram_id, display_name, lang) values (${TG_ID}, 'Скриншот', 'kk')
  on conflict (telegram_id) do update set display_name = excluded.display_name returning id`;

// Күшті құрам: ұпайы көптер, клубтан 3-тен аспай, бюджетке сыйғызып (қалған орындарға ең арзанынан қалдырып)
type Cand = { id: string; position: Position; club_id: string; price: number; points: number };
const cands = await sql<Cand[]>`select p.id, p.position, p.club_id, p.price, coalesce(s.points, 0)::int as points
  from players p left join player_season_stats s on s.player_id = p.id order by points desc, p.price`;
const need: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const perClub = new Map<string, number>();
const chosen: Cand[] = [];
let budget = 1000;
for (const c of cands) {
  const left = Object.values(need).reduce((s, n) => s + n, 0);
  if (need[c.position] === 0 || (perClub.get(c.club_id) ?? 0) >= 3 || c.price + (left - 1) * 40 > budget) continue;
  chosen.push(c);
  need[c.position]--;
  budget -= c.price;
  perClub.set(c.club_id, (perClub.get(c.club_id) ?? 0) + 1);
}
const XI: Record<Position, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
const order: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const by = (pos: Position) => chosen.filter((c) => c.position === pos).sort((a, b) => b.points - a.points);
const xi = order.flatMap((pos) => by(pos).slice(0, XI[pos]));
const bench = order.flatMap((pos) => by(pos).slice(XI[pos]));
const leaders = xi.filter((p) => p.position !== 'GK').sort((a, b) => b.points - a.points);
const picks = [...xi, ...bench].map((p, i) => ({ playerId: p.id, slot: i + 1, isCaptain: p.id === leaders[0].id, isVice: p.id === leaders[1].id }));

const [gw] = await sql<{ deadline: Date }[]>`select deadline from gameweeks where number = ${FIRST_GW}`;
const created = await createFirstSquad(sql, user.id, new Date(gw.deadline.getTime() - 3_600_000), picks, FIRST_GW);
if (!created.ok) throw new Error(`Состав не создан: ${JSON.stringify(created)}`);
const view = await loadTeamView(sql, user.id, NOW);

const clubs = await sql`select id, source_id, name_ru, name_kz, code, logo_url, kit from clubs order by name_ru`;
const players = await sql`select p.id, p.first_name, p.last_name, p.position, p.club_id, p.price, p.status from players p
  join player_season_stats s on s.player_id = p.id where s.minutes > 0 or p.id = any(${picks.map((p) => p.playerId)}::uuid[])`;
const ids = players.map((p) => p.id as string);
const seasonStats = await sql`select * from player_season_stats where player_id = any(${ids}::uuid[])`;
const selection = await sql`select * from player_selection`;
const gameweeks = await sql`select id, number, deadline from gameweeks order by number`;
const fixtures = await sql`select f.id, f.kickoff, f.status, f.home_club_id, f.away_club_id, f.home_score, f.away_score, g.number
  from fixtures f join gameweeks g on g.id = f.gameweek_id order by f.kickoff`;
const matches = await sql`select s.player_id, s.points, s.minutes, f.kickoff, f.status, g.number from player_match_stats s
  join fixtures f on f.id = s.fixture_id join gameweeks g on g.id = f.gameweek_id where s.player_id = any(${picks.map((p) => p.playerId)}::uuid[])`;

const out = path.join(import.meta.dirname, '..', '..', 'apps', 'web', 'e2e', 'data.json');
fs.writeFileSync(out, JSON.stringify({ now: NOW.toISOString(), view, clubs, players, seasonStats, selection, gameweeks, fixtures, matches }));
console.log(`${out}: ${fs.statSync(out).size} байт; тур ${view.last?.number}: ${view.last?.points} очков, открыт ${view.next?.number}`);
await sql.end();
