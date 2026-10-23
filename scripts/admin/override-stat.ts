// Иесінің өтініші бойынша статистиканы қолмен түзету (спецификация 9): manual_override, ұпайды қайта есептеу, audit_log.
// Тур жабылған болса, «ойналды» күйіне қайтады: келесі cron-tick ұпайлар мен орындарды қайта есептеп, қайта жабады.
// Қолданылуы: npm run admin:override -- --fixture 1109 --player "Фамилия" --set goals=1,assists=0 --reason "протокол лиги" [--apply]
import { pathToFileURL } from 'node:url';
import type { ScoringRules } from '../../packages/core/src/rules.js';
import { scorePlayer } from '../../packages/core/src/scoring.js';
import type { PlayerMatchStat, Position } from '../../packages/core/src/types.js';
import { envOpts, literal, runQuery } from '../deploy/management.js';

export const FIELDS = {
  minutes: 'minutes', goals: 'goals', assists: 'assists', penaltyGoals: 'penalty_goals', ownGoals: 'own_goals', yellow: 'yellow',
  red: 'red', conceded: 'conceded', penaltiesSaved: 'penalties_saved', penaltiesMissed: 'penalties_missed'
} as const;
export type Field = keyof typeof FIELDS;

export interface DbStatRow {
  fixture_id: string;
  player_id: string;
  last_name: string;
  first_name: string;
  position: Position;
  rules: ScoringRules;
  minutes: number;
  on_minute: number | null;
  off_minute: number | null;
  goals: number;
  assists: number;
  penalty_goals: number;
  own_goals: number;
  yellow: number;
  red: number;
  conceded: number;
  penalties_saved: number;
  penalties_missed: number;
  points: number;
}

export function findRowsSql(fixtureSourceId: number, lastName: string): string {
  return `select s.fixture_id, s.player_id, p.last_name, p.first_name, p.position, se.scoring_rules as rules,
    s.minutes, s.on_minute, s.off_minute, s.goals, s.assists, s.penalty_goals, s.own_goals, s.yellow, s.red, s.conceded,
    s.penalties_saved, s.penalties_missed, s.points
  from player_match_stats s join players p on p.id = s.player_id join fixtures f on f.id = s.fixture_id join seasons se on se.id = f.season_id
  where f.source_id = ${Number(fixtureSourceId)} and p.last_name ilike ${literal(`%${lastName}%`)}`;
}

export function rowToStat(r: DbStatRow): PlayerMatchStat {
  return {
    playerSourceId: 0, teamSourceId: 0, position: r.position, minutes: r.minutes, onMinute: r.on_minute, offMinute: r.off_minute,
    goals: r.goals, assists: r.assists, penaltyGoals: r.penalty_goals, ownGoals: r.own_goals, yellow: r.yellow, red: r.red,
    conceded: r.conceded, penaltiesSaved: r.penalties_saved, penaltiesMissed: r.penalties_missed
  };
}

export function buildOverrideSql(
  row: { fixture_id: string; player_id: string; position: Position; rules: ScoringRules; current: PlayerMatchStat },
  change: Partial<Record<Field, number>>,
  reason: string
): string {
  const next: PlayerMatchStat = { ...row.current, ...change };
  const before = scorePlayer(row.current, row.position, row.rules);
  const after = scorePlayer(next, row.position, row.rules);
  const sets = (Object.keys(change) as Field[]).map((k) => `${FIELDS[k]} = ${Number(change[k])}`);
  const pick = (s: PlayerMatchStat, points: number) => ({ ...Object.fromEntries((Object.keys(change) as Field[]).map((k) => [k, s[k]])), points });
  const payload = { fixtureId: row.fixture_id, playerId: row.player_id, reason, before: pick(row.current, before.total), after: pick(next, after.total) };
  const where = `fixture_id = ${literal(row.fixture_id)} and player_id = ${literal(row.player_id)}`;
  return `begin;
update player_match_stats set ${[...sets, `points = ${after.total}`, `points_lines = ${literal(JSON.stringify(after.lines))}::jsonb`, 'manual_override = true'].join(', ')}
  where ${where};
insert into audit_log (action, payload) values ('stat_override', ${literal(JSON.stringify(payload))}::jsonb);
update gameweeks set status = 'played' where status = 'closed' and id = (select gameweek_id from fixtures where id = ${literal(row.fixture_id)});
commit;`;
}

export function parseSet(text: string): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  for (const part of text.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [k, v] = part.split('=');
    if (!(k in FIELDS) || !/^\d+$/.test(v ?? '')) throw new Error(`Неверное поле: ${part}. Поля: ${Object.keys(FIELDS).join(', ')}`);
    out[k as Field] = Number(v);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const fixture = Number(arg('fixture'));
  const player = arg('player');
  const set = arg('set');
  const reason = arg('reason') ?? 'по просьбе владельца';
  if (!fixture || !player || !set) throw new Error('Нужно: --fixture <id матча на сайте> --player "<фамилия>" --set goals=1,... [--reason "…"] [--apply]');
  const opts = envOpts();
  const rows = await runQuery<DbStatRow>(opts, findRowsSql(fixture, player), 'поиск игрока');
  if (rows.length !== 1) throw new Error(rows.length ? `Несколько игроков: ${rows.map((r) => `${r.first_name} ${r.last_name}`).join(', ')}` : 'Игрок в этом матче не найден');
  const row = rows[0];
  const change = parseSet(set);
  const statement = buildOverrideSql({ ...row, current: rowToStat(row) }, change, reason);
  const after = scorePlayer({ ...rowToStat(row), ...change }, row.position, row.rules).total;
  console.log(`${row.first_name} ${row.last_name}: ${Object.entries(change).map(([k, v]) => `${k} ${rowToStat(row)[k as Field]} → ${v}`).join(', ')}; очки ${row.points} → ${after}`);
  if (!process.argv.includes('--apply')) {
    console.log('Проверка без изменений. Чтобы применить, добавьте --apply');
  } else {
    await runQuery(opts, statement, 'правка');
    console.log('Готово: очки команд пересчитает следующий cron-tick (до 15 минут).');
  }
}
