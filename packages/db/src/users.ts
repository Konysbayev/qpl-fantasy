// Telegram арқылы кірген пайдаланушыны жазады: жаңасы — тілімен, бұрынғысының тек аты жаңарады (таңдаған тілі сақталады).
import type postgres from 'postgres';
import type { TelegramUser } from '../../auth/src/telegram.js';

export type Lang = 'kk' | 'ru';

export interface AppUser {
  id: string;
  displayName: string;
  lang: Lang;
}

export async function upsertTelegramUser(sql: postgres.Sql, tg: TelegramUser): Promise<AppUser> {
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ').trim() || tg.username || String(tg.id);
  const lang: Lang = tg.language_code === 'ru' ? 'ru' : 'kk';
  const [row] = await sql<{ id: string; display_name: string; lang: Lang }[]>`
    insert into users (telegram_id, display_name, lang) values (${tg.id}, ${name}, ${lang})
    on conflict (telegram_id) do update set display_name = excluded.display_name
    returning id, display_name, lang`;
  return { id: row.id, displayName: row.display_name, lang: row.lang };
}
