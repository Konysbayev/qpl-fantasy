import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../../packages/core/src/rules.js';
import { parseMatchPage } from '../../../packages/kffleague/src/match.js';
import { upsertMatch } from '../../../packages/db/src/sync.js';
import { freshDb } from '../../../packages/db/test/helpers.js';
import { seedBlocked, buildSeed, renderPricesReport, upsertSql, type ClubMeta } from '../seed-remote.js';

describe('upsertSql', () => {
  it('экранирует кавычки, null, JSON и массивы; режет на пачки по 500', () => {
    const rows = Array.from({ length: 1001 }, (_, i) => [i, i === 0 ? "О'Нил" : null, { a: [1] }, ['x', "y'"], true]);
    const out = upsertSql('t', ['id', 'name', 'meta', 'tags', 'ok'], rows, ['id']);
    expect(out).toHaveLength(3);
    expect(out[0]).toContain("(0, 'О''Нил', '{\"a\":[1]}', array['x', 'y''']::text[], true)");
    expect(out[0]).toContain('(1, null,');
    expect(out[0]).toContain('on conflict (id) do update set name = excluded.name, meta = excluded.meta, tags = excluded.tags, ok = excluded.ok');
    expect(out[2].match(/\),\s*\(/g)).toBeNull();
  });

  it('пустой массив — типизированный литерал', () => {
    expect(upsertSql('t', ['id', 'tags'], [[1, []]], ['id'])[0]).toContain("(1, '{}'::text[])");
  });
});

const page = (id: number) =>
  gunzipSync(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'packages', 'kffleague', 'test', 'fixtures', `match-${id}.html.gz`))).toString('utf-8');

describe('buildSeed', () => {
  let src: postgres.Sql;
  let dst: postgres.Sql;
  let clubs: ClubMeta[];

  beforeAll(async () => {
    src = await freshDb('qpl_test_seed_src');
    dst = await freshDb('qpl_test_seed_dst');
    const [s] = await src`insert into seasons (year, source_season_id, scoring_rules, status) values (2026, 200, ${src.json(DEFAULT_RULES as never)}, 'finished') returning id`;
    for (const id of [896, 993, 1109]) {
      const html = page(id);
      await upsertMatch(src, s.id, parseMatchPage(html, id), html);
    }
    const rows = await src<{ source_id: number }[]>`select source_id from clubs order by source_id`;
    clubs = rows.map((r, i) => ({
      source_id: r.source_id, code: `К${i}Б`, name_kz: `Клуб ${i}`, logo: `/clubs/${r.source_id}.png`,
      kit: { shirt: '#111111', sleeves: '#111111', trim: '#FFFFFF', stripes: null, strip: ['#111111', '#FFFFFF'] }, verify: true
    }));
  });
  afterAll(async () => {
    await src?.end();
    await dst?.end();
  });

  const counts = async (sql: postgres.Sql) => {
    const out: Record<string, number> = {};
    for (const t of ['seasons', 'clubs', 'players', 'gameweeks', 'fixtures', 'player_match_stats']) {
      out[t] = (await sql.unsafe(`select count(*)::int as n from ${t}`))[0].n as number;
    }
    return out;
  };

  it('переносит сезон в другую базу; повторный запуск обновляет, а не дублирует', async () => {
    const { statements } = await buildSeed(src, { sourceSeasonId: 200, clubs });
    for (const s of statements) await dst.unsafe(s);
    const first = await counts(dst);
    expect(first).toEqual(await counts(src));
    expect(first.fixtures).toBe(3);

    for (const s of statements) await dst.unsafe(s);
    expect(await counts(dst)).toEqual(first);
  });

  it('клубы получают код, форму и свой логотип; сезон активен; цены — из draftPrices', async () => {
    const { statements, prices } = await buildSeed(src, { sourceSeasonId: 200, clubs });
    for (const s of statements) await dst.unsafe(s);

    const [club] = await dst`select code, name_kz, logo_url, kit from clubs where source_id = ${clubs[0].source_id}`;
    expect(club).toMatchObject({ code: clubs[0].code, name_kz: clubs[0].name_kz, logo_url: clubs[0].logo, kit: clubs[0].kit });
    const [season] = await dst`select status from seasons`;
    expect(season.status).toBe('active');

    const priced = await dst<{ source_id: number; price: number }[]>`select source_id, price from players`;
    expect(prices.length).toBe(priced.length);
    for (const p of prices) expect(priced.find((r) => r.source_id === p.sourceId)?.price).toBe(p.price);
    // За 3 матча ни у кого нет 450 минут — по правилу все стоят 4.0
    expect(prices.every((p) => p.minutes < 450)).toBe(true);
    expect(new Set(priced.map((p) => p.price))).toEqual(new Set([40]));
  });

  it('ручная правка статистики в облаке не перезаписывается посевом', async () => {
    const { statements } = await buildSeed(src, { sourceSeasonId: 200, clubs });
    for (const s of statements) await dst.unsafe(s);
    const [row] = await dst`update player_match_stats set points = 99, manual_override = true
      where (fixture_id, player_id) = (select fixture_id, player_id from player_match_stats limit 1) returning fixture_id, player_id`;
    for (const s of statements) await dst.unsafe(s);
    const [after] = await dst`select points from player_match_stats where fixture_id = ${row.fixture_id} and player_id = ${row.player_id}`;
    expect(after.points).toBe(99);
  });
});

describe('renderPricesReport', () => {
  it('таблица цен по клубам: цена в млн с одной цифрой после точки, дорогие сверху', () => {
    const md = renderPricesReport('2026-10-22', [
      { sourceId: 1, name: 'Марк Гуаль', club: 'Кайрат', position: 'MID', price: 100, points: 100, minutes: 1089 },
      { sourceId: 2, name: 'Темирлан Анарбеков', club: 'Кайрат', position: 'GK', price: 60, points: 101, minutes: 2340 },
      { sourceId: 3, name: 'Урош Милованович', club: 'Тобыл', position: 'FWD', price: 95, points: 95, minutes: 2214 }
    ]);
    expect(md).toContain('## Кайрат');
    expect(md).toContain('| Марк Гуаль | ПЗ | 10.0 | 100 | 1089 |');
    expect(md.indexOf('Марк Гуаль')).toBeLessThan(md.indexOf('Темирлан Анарбеков'));
    expect(md).toContain('## Тобыл');
  });
});

describe('seedBlocked', () => {
  it('после первого изменения цен посев запрещён (иначе он затрёт цены), до него и без таблицы — разрешён', async () => {
    const run = (rows: Record<string, unknown>[]) => async () => rows;
    expect(await seedBlocked(run([{ n: 3 }]))).toBe(true);
    expect(await seedBlocked(run([{ n: 0 }]))).toBe(false);
    expect(await seedBlocked(run([{ n: null }]))).toBe(false);
  });
});
