// Тесттік мини-лига: 6 клуб, әр клубта 1 ҚҚ, 2 ҚОР, 2 ЖҚ, 1 ШАБ (бағасы 5.0), 3 тур бір апта сайын.
import type postgres from 'postgres';
import { DEFAULT_RULES } from '../../core/src/rules.js';
import type { Position } from '../../core/src/types.js';

export interface League {
  seasonId: string;
  gws: { id: string; number: number; deadline: Date }[];
  clubs: string[];
  // clubIdx-ші клубтың n-ші ойыншысы
  player: (pos: Position, clubIdx: number, n?: number) => string;
}

export interface PickInput {
  playerId: string;
  slot: number;
  isCaptain: boolean;
  isVice: boolean;
}

const WEEK = 7 * 86_400_000;
export const START = new Date('2026-03-07T09:00:00Z');

export async function seedLeague(sql: postgres.Sql): Promise<League> {
  await sql`truncate seasons, clubs, players, gameweeks, fixtures, player_match_stats, users, squads, squad_picks, transfers cascade`;
  const [season] = await sql`insert into seasons (year, scoring_rules, status) values (2026, ${sql.json(DEFAULT_RULES as never)}, 'active') returning id`;
  const gws: League['gws'] = [];
  for (let n = 1; n <= 3; n++) {
    const deadline = new Date(START.getTime() + (n - 1) * WEEK);
    const [g] = await sql`insert into gameweeks (season_id, number, deadline) values (${season.id}, ${n}, ${deadline}) returning id`;
    gws.push({ id: g.id, number: n, deadline });
  }
  const clubs: string[] = [];
  const ids = new Map<string, string>();
  for (let c = 0; c < 6; c++) {
    const [club] = await sql`insert into clubs (source_id, name_ru, code) values (${1000 + c}, ${`Клуб ${c}`}, ${`К${c}`}) returning id`;
    clubs.push(club.id);
    const roster: [Position, number][] = [['GK', 0], ['DEF', 0], ['DEF', 1], ['MID', 0], ['MID', 1], ['FWD', 0]];
    for (const [pos, n] of roster) {
      const [p] = await sql`insert into players (first_name, last_name, club_id, position, price)
        values (${'Имя'}, ${`${pos}${c}${n}`}, ${club.id}, ${pos}, 50) returning id`;
      ids.set(`${pos}-${c}-${n}`, p.id);
    }
  }
  const player = (pos: Position, c: number, n = 0) => {
    const id = ids.get(`${pos}-${c}-${n}`);
    if (!id) throw new Error(`Нет игрока ${pos}-${c}-${n}`);
    return id;
  };
  return { seasonId: season.id, gws, clubs, player };
}

// Дұрыс құрам 1-4-4-2: клубтар 0–4-тен үш-үштен, 15 × 5.0 = 75.0 млн; капитан — ЖҚ 0, вице — ШАБ 2
export function standardPicks(L: League): PickInput[] {
  const p = (playerId: string, slot: number, extra: Partial<PickInput> = {}) => ({ playerId, slot, isCaptain: false, isVice: false, ...extra });
  return [
    p(L.player('GK', 0), 1),
    p(L.player('DEF', 0), 2), p(L.player('DEF', 1), 3), p(L.player('DEF', 2), 4), p(L.player('DEF', 3), 5),
    p(L.player('MID', 0), 6, { isCaptain: true }), p(L.player('MID', 1), 7), p(L.player('MID', 2), 8), p(L.player('MID', 3), 9),
    p(L.player('FWD', 2), 10, { isVice: true }), p(L.player('FWD', 3), 11),
    p(L.player('GK', 1), 12), p(L.player('DEF', 4), 13), p(L.player('MID', 4), 14), p(L.player('FWD', 4), 15)
  ];
}

let tg = 1;
export async function newUser(sql: postgres.Sql): Promise<string> {
  const [u] = await sql`insert into users (telegram_id, display_name) values (${tg++}, 'Тест') returning id`;
  return u.id;
}
