import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../../packages/core/src/rules.js';
import { parseMatchPage } from '../../../packages/kffleague/src/match.js';
import { upsertMatch } from '../../../packages/db/src/sync.js';
import { freshDb } from '../../../packages/db/test/helpers.js';
import { matchPage } from '../../../packages/db/test/source.js';
import { buildPhotoSql, collectPhotos } from '../backfill-photos.js';

let sql: postgres.Sql;
beforeAll(async () => {
  sql = await freshDb('qpl_test_backfill_photos');
  const [s] = await sql`insert into seasons (year, source_season_id, scoring_rules) values (2026, 200, ${sql.json(DEFAULT_RULES as never)}) returning id`;
  const html = matchPage(993);
  await upsertMatch(sql, s.id, parseMatchPage(html, 993), html);
});
afterAll(async () => {
  await sql?.end();
});

describe('backfill-photos', () => {
  it('ссылки из страниц матчей попадают к игрокам по id источника', async () => {
    await sql`update players set photo_url = null`;
    const photos = collectPhotos([parseMatchPage(matchPage(993), 993)]);
    expect(photos.get(445)).toBe('https://kffleague.kz/storage/qfl-files/player_photos/18159_leaderboard_9c6d8ab8.png');
    for (const s of buildPhotoSql(photos)) await sql.unsafe(s);
    const [p] = await sql`select photo_url from players where source_id = 445`;
    expect(p.photo_url).toBe(photos.get(445));
  });
});
