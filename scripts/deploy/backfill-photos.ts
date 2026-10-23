// Ойыншы фотоларының сілтемелері бұлтқа: жергілікті репетиция базасындағы шикі беттерден (сайтқа сұраусыз). Кейінгі матчтар — cron-tick арқылы.
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import type { MatchFacts } from '../../packages/core/src/types.js';
import { parseMatchPage } from '../../packages/kffleague/src/match.js';
import { envOpts, literal, runQuery } from './management.js';

// Соңғы матчтағы фото жеңеді (матчтар уақыт бойынша берілуі керек)
export function collectPhotos(matches: MatchFacts[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of [...matches].sort((a, b) => a.kickoff.localeCompare(b.kickoff))) {
    for (const p of m.lineups) if (p.photoUrl) out.set(p.sourceId, p.photoUrl);
  }
  return out;
}

export function buildPhotoSql(photos: Map<number, string>, batch = 300): string[] {
  const rows = [...photos.entries()].map(([id, url]) => `(${Number(id)}, ${literal(url)})`);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += batch) {
    out.push(`update players p set photo_url = v.url from (values ${rows.slice(i, i + batch).join(', ')}) as v(src, url)
where p.source_id = v.src and p.photo_url is distinct from v.url`);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const local = postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/qpl_rehearsal', { onnotice: () => {} });
  const raw = await local<{ fixture_source_id: number; body: string }[]>`select fixture_source_id, body from source_raw`;
  await local.end();
  const matches: MatchFacts[] = [];
  for (const r of raw) {
    try {
      matches.push(parseMatchPage(r.body, r.fixture_source_id));
    } catch {
      // Талданбаған бет өткізіледі
    }
  }
  const opts = envOpts();
  for (const s of buildPhotoSql(collectPhotos(matches))) await runQuery(opts, s, 'фото');
  const [c] = await runQuery(opts, 'select count(*) filter (where photo_url is not null) as with_photo, count(*) as players from players');
  console.log(`Игроков с фото: ${c.with_photo} из ${c.players}`);
}
