// Жергілікті репетиция базасынан (qpl_rehearsal) маусымды бұлтқа жүктейді: клубтар (clubs.json), бағалар (draftPrices), турлар, матчтар, статистика.
// Қайта іске қосу жаңартады, қайталамайды; бұлттағы қолмен түзетілген статистика (manual_override) өзгермейді.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { draftPrices } from '../../packages/core/src/pricing.js';
import type { ClubKit, Position } from '../../packages/core/src/types.js';
import { envOpts, literal, runQuery } from './management.js';

export interface ClubMeta {
  source_id: number;
  code: string;
  name_kz: string;
  logo: string;
  kit: ClubKit;
  verify: boolean;
}

export interface PriceRow {
  sourceId: number;
  name: string;
  club: string;
  position: Position;
  price: number;
  points: number;
  minutes: number;
}

// jsonb бағанына массив жазу үшін (жай массив text[] болып жазылады)
export class Json {
  constructor(readonly value: unknown) {}
}

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Нечисловое значение ${v}`);
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return literal(v.toISOString());
  if (typeof v === 'string') return literal(v);
  if (v instanceof Json) return literal(JSON.stringify(v.value));
  if (Array.isArray(v)) return v.length === 0 ? `'{}'::text[]` : `array[${v.map((x) => literal(String(x))).join(', ')}]::text[]`;
  return literal(JSON.stringify(v));
}

export function upsertSql(table: string, columns: string[], rows: unknown[][], conflict: string[], opts: { batch?: number; updateWhere?: string } = {}): string[] {
  const batch = opts.batch ?? 500;
  const updates = columns.filter((c) => !conflict.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ');
  const tail = `on conflict (${conflict.join(', ')}) do update set ${updates}${opts.updateWhere ? ` where ${opts.updateWhere}` : ''}`;
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += batch) {
    const values = rows.slice(i, i + batch).map((r) => `(${r.map(sqlValue).join(', ')})`).join(',\n');
    out.push(`insert into ${table} (${columns.join(', ')}) values\n${values}\n${tail}`);
  }
  return out;
}

type Row = Record<string, unknown>;
const pick = (rows: Row[], columns: string[]) => rows.map((r) => columns.map((c) => r[c]));

export async function buildSeed(sql: postgres.Sql, opts: { sourceSeasonId: number; clubs: ClubMeta[] }): Promise<{ statements: string[]; prices: PriceRow[] }> {
  const [season] = await sql<Row[]>`select id, year, source_season_id, scoring_rules from seasons where source_season_id = ${opts.sourceSeasonId}`;
  if (!season) throw new Error(`Нет сезона ${opts.sourceSeasonId} в локальной базе`);
  const sid = season.id as string;

  const clubs = await sql<Row[]>`select id, source_id, name_ru from clubs
    where id in (select home_club_id from fixtures where season_id = ${sid} union select away_club_id from fixtures where season_id = ${sid}) order by source_id`;
  const meta = new Map(opts.clubs.map((c) => [c.source_id, c]));
  for (const c of clubs) {
    const m = meta.get(c.source_id as number);
    if (!m) throw new Error(`Клуба ${c.name_ru} (source_id ${c.source_id}) нет в clubs.json`);
    Object.assign(c, { code: m.code, name_kz: m.name_kz, logo_url: m.logo, kit: m.kit });
  }
  const clubName = new Map(clubs.map((c) => [c.id as string, c.name_ru as string]));

  const players = await sql<Row[]>`
    select p.id, p.source_id, p.first_name, p.last_name, p.club_id, p.position, p.status, p.needs_review,
           coalesce(sum(s.points) filter (where f.status = 'finished'), 0)::int as points,
           coalesce(sum(s.minutes) filter (where f.status = 'finished'), 0)::int as minutes
    from players p join player_match_stats s on s.player_id = p.id join fixtures f on f.id = s.fixture_id
    where f.season_id = ${sid} group by p.id order by p.source_id`;
  const prices = draftPrices(players.map((p) => ({ id: p.id as string, position: p.position as Position, points: p.points as number, minutes: p.minutes as number })));
  for (const p of players) p.price = prices.get(p.id as string);

  const gameweeks = await sql<Row[]>`select id, season_id, number, deadline, status, deadline_locked from gameweeks where season_id = ${sid} order by number`;
  const fixtures = await sql<Row[]>`select id, source_id, season_id, gameweek_id, home_club_id, away_club_id, kickoff, status, home_score, away_score,
      needs_review, source_tour, updated_at from fixtures where season_id = ${sid} order by source_id`;
  const statCols = ['fixture_id', 'player_id', 'minutes', 'on_minute', 'off_minute', 'goals', 'assists', 'penalty_goals', 'own_goals', 'yellow', 'red',
    'conceded', 'penalties_saved', 'penalties_missed', 'points', 'points_lines'];
  const stats = await sql<Row[]>`select s.* from player_match_stats s join fixtures f on f.id = s.fixture_id where f.season_id = ${sid} order by s.fixture_id, s.player_id`;
  for (const s of stats) s.points_lines = new Json(s.points_lines);

  // Бұлтта маусым — ағымдағы ойын маусымы
  const seasonRow = { ...season, status: 'active' };
  const statements = [
    ...upsertSql('seasons', ['id', 'year', 'source_season_id', 'scoring_rules', 'status'], pick([seasonRow], ['id', 'year', 'source_season_id', 'scoring_rules', 'status']), ['id']),
    ...upsertSql('clubs', ['id', 'source_id', 'name_ru', 'name_kz', 'code', 'logo_url', 'kit'], pick(clubs, ['id', 'source_id', 'name_ru', 'name_kz', 'code', 'logo_url', 'kit']), ['id']),
    ...upsertSql('players', ['id', 'source_id', 'first_name', 'last_name', 'club_id', 'position', 'price', 'status', 'needs_review'],
      pick(players, ['id', 'source_id', 'first_name', 'last_name', 'club_id', 'position', 'price', 'status', 'needs_review']), ['id']),
    ...upsertSql('gameweeks', ['id', 'season_id', 'number', 'deadline', 'status', 'deadline_locked'], pick(gameweeks, ['id', 'season_id', 'number', 'deadline', 'status', 'deadline_locked']), ['id']),
    ...upsertSql('fixtures', ['id', 'source_id', 'season_id', 'gameweek_id', 'home_club_id', 'away_club_id', 'kickoff', 'status', 'home_score', 'away_score', 'needs_review', 'source_tour', 'updated_at'],
      pick(fixtures, ['id', 'source_id', 'season_id', 'gameweek_id', 'home_club_id', 'away_club_id', 'kickoff', 'status', 'home_score', 'away_score', 'needs_review', 'source_tour', 'updated_at']), ['id']),
    ...upsertSql('player_match_stats', statCols, pick(stats, statCols), ['fixture_id', 'player_id'], { updateWhere: 'player_match_stats.manual_override = false' })
  ];

  const priceRows: PriceRow[] = players.map((p) => ({
    sourceId: p.source_id as number,
    name: `${p.first_name} ${p.last_name}`,
    club: clubName.get(p.club_id as string) ?? '—',
    position: p.position as Position,
    price: p.price as number,
    points: p.points as number,
    minutes: p.minutes as number
  }));
  return { statements, prices: priceRows };
}

const POS_RU: Record<Position, string> = { GK: 'ВР', DEF: 'ЗАЩ', MID: 'ПЗ', FWD: 'НАП' };

export function renderPricesReport(date: string, prices: PriceRow[]): string {
  const clubs = [...new Set(prices.map((p) => p.club))].sort((a, b) => a.localeCompare(b, 'ru'));
  const lines = [
    '# Стартовые цены — черновик на утверждение',
    '',
    `Дата: ${date}. Формула: цена = 4.0 + (максимум позиции − 4.0) × (очки / лучший на позиции)^0.7, вниз до 0.5 млн; меньше 450 минут — 4.0. Максимум: ВР 6.0, ЗАЩ 7.0, ПЗ и НАП 10.0. Очки — сезон ҚПЛ-2026 по правилам 4.4.`,
    '',
    `Игроков: ${prices.length}. Цены 10.0 млн: ${prices.filter((p) => p.price === 100).length}, 4.0 млн: ${prices.filter((p) => p.price === 40).length}.`,
    ''
  ];
  for (const club of clubs) {
    lines.push(`## ${club}`, '', '| Игрок | Поз. | Цена | Очки | Минуты |', '|---|---|---|---|---|');
    const rows = prices.filter((p) => p.club === club).sort((a, b) => b.price - a.price || b.points - a.points);
    for (const p of rows) lines.push(`| ${p.name} | ${POS_RU[p.position]} | ${(p.price / 10).toFixed(1)} | ${p.points} | ${p.minutes} |`);
    lines.push('');
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const local = postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/qpl_rehearsal', { onnotice: () => {} });
  const clubs = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'supabase', 'seed', 'clubs.json'), 'utf-8')) as ClubMeta[];
  const { statements, prices } = await buildSeed(local, { sourceSeasonId: Number(process.env.SOURCE_SEASON_ID ?? 200), clubs });
  await local.end();

  const date = new Date().toISOString().slice(0, 10);
  const reportPath = path.join('docs', 'research', `${date}-prices-draft.md`);
  fs.writeFileSync(reportPath, renderPricesReport(date, prices));
  console.log(`Отчёт с ценами: ${reportPath}`);

  if (process.argv.includes('--report-only')) process.exit(0);
  const opts = envOpts();
  for (const [i, s] of statements.entries()) await runQuery(opts, s, `пачка ${i + 1}/${statements.length}`);
  const counts = await runQuery(opts, `select (select count(*) from clubs) as clubs, (select count(*) from players) as players,
    (select count(*) from fixtures) as fixtures, (select count(*) from player_match_stats) as stats`);
  console.log('В облаке:', counts[0]);
}
