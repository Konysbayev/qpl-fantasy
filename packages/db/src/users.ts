// Telegram арқылы кірген пайдаланушыны жазады: жаңасы — тілімен, бұрынғысының тек аты жаңарады (таңдаған тілі сақталады).
import type postgres from 'postgres';
import type { TelegramUser } from '../../auth/src/telegram.js';

export type Lang = 'kk' | 'ru';

export interface AppUser {
  id: string;
  displayName: string;
  lang: Lang;
  // Боттағы хабарламалар қосулы ма (әдепкі — иә)
  notify: boolean;
}

export async function upsertTelegramUser(sql: postgres.Sql, tg: TelegramUser): Promise<AppUser> {
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ').trim() || tg.username || String(tg.id);
  const lang: Lang = tg.language_code === 'ru' ? 'ru' : 'kk';
  const [row] = await sql<{ id: string; display_name: string; lang: Lang; notify: boolean }[]>`
    insert into users (telegram_id, display_name, lang) values (${tg.id}, ${name}, ${lang})
    on conflict (telegram_id) do update set display_name = excluded.display_name
    returning id, display_name, lang, coalesce(notify->>'enabled', 'true') <> 'false' as notify`;
  return { id: row.id, displayName: row.display_name, lang: row.lang, notify: row.notify };
}

// Профиль: тіл және хабарламалар. Қосқанда «ботты бұғаттаған» белгісі алынады
export async function saveProfile(sql: postgres.Sql, userId: string, p: { lang?: Lang; notify?: boolean }): Promise<{ lang: Lang; notify: boolean }> {
  const [row] = await sql<{ lang: Lang; notify: boolean }[]>`
    update users set
      lang = coalesce(${p.lang ?? null}::text, lang),
      notify = case when ${p.notify ?? null}::boolean is null then notify else jsonb_build_object('enabled', ${p.notify ?? null}::boolean) end
    where id = ${userId}
    returning lang, coalesce(notify->>'enabled', 'true') <> 'false' as notify`;
  return row;
}
