import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { applyMigrations } from '../src/migrate.js';
import { MIGRATIONS_DIR, asRole, freshDb } from './helpers.js';

let sql: postgres.Sql;

beforeAll(async () => {
  sql = await freshDb('qpl_test_schema');
});
afterAll(async () => {
  await sql?.end();
});

async function seed() {
  const [season] = await sql`insert into seasons (year, source_season_id, scoring_rules) values (2026, 200, '{}') returning id`;
  const [club] = await sql`insert into clubs (source_id, name_ru) values (13, 'Кайрат') returning id`;
  const [player] = await sql`insert into players (source_id, first_name, last_name, club_id, position, price) values (1, 'А', 'Б', ${club.id}, 'MID', 60) returning id`;
  const [gw] = await sql`insert into gameweeks (season_id, number, deadline) values (${season.id}, 1, now() + interval '1 day') returning id`;
  return { season, club, player, gw };
}

describe('схема базы', () => {
  it('миграции применяются на чистую базу и повторно ничего не делают', async () => {
    expect(await applyMigrations(sql, MIGRATIONS_DIR)).toEqual([]);
    const [{ n }] = await sql`select count(*)::int as n from schema_migrations`;
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it('позиция игрока вне GK/DEF/MID/FWD отклоняется', async () => {
    const [club] = await sql`insert into clubs (source_id, name_ru) values (900, 'Тест') returning id`;
    await expect(sql`insert into players (source_id, first_name, last_name, club_id, position, price) values (901, 'А', 'Б', ${club.id}, 'XX', 45)`).rejects.toThrow(/check/i);
  });

  it('anon читает игроков, но не может их изменить', async () => {
    const { club } = await seed();
    const rows = await asRole(sql, 'anon', null, (tx) => tx`select id from players`);
    expect(rows.length).toBeGreaterThan(0);
    await expect(asRole(sql, 'anon', null, (tx) => tx`update players set price = 120`)).rejects.toThrow(/permission denied/i);
    await expect(asRole(sql, 'anon', null, (tx) => tx`insert into clubs (source_id, name_ru) values (999, 'X')`)).rejects.toThrow(/permission denied/i);
    expect(club.id).toBeTruthy();
  });

  it('пользователь видит свой состав, а чужой — только после дедлайна', async () => {
    const [season] = await sql`insert into seasons (year, source_season_id, scoring_rules) values (2027, 300, '{}') returning id`;
    const [gw] = await sql`insert into gameweeks (season_id, number, deadline) values (${season.id}, 1, now() + interval '1 day') returning id`;
    const authA = '00000000-0000-0000-0000-00000000000a';
    const authB = '00000000-0000-0000-0000-00000000000b';
    const [a] = await sql`insert into users (telegram_id, auth_id, display_name) values (1, ${authA}, 'A') returning id`;
    const [b] = await sql`insert into users (telegram_id, auth_id, display_name) values (2, ${authB}, 'B') returning id`;
    await sql`insert into squads (user_id, gameweek_id, bank, free_transfers) values (${a.id}, ${gw.id}, 0, 1), (${b.id}, ${gw.id}, 0, 1)`;

    const visibleToA = async () => (await asRole(sql, 'authenticated', authA, (tx) => tx`select user_id from squads where gameweek_id = ${gw.id}`)).map((r) => r.user_id);
    expect(await visibleToA()).toEqual([a.id]);

    await sql`update gameweeks set deadline = now() - interval '1 minute' where id = ${gw.id}`;
    expect((await visibleToA()).sort()).toEqual([a.id, b.id].sort());
  });
});
