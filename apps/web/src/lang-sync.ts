// Құрылғыда таңдалған тіл серверде де болуы керек: боттағы хабарламалар сол тілде келеді (этап 3-ке дейін таңдалғандар үшін)
import type { Api } from './api.js';
import type { Lang } from './i18n/useT.js';

export function syncServerLang(saved: Lang | null, server: Lang, api: Pick<Api, 'saveProfile'>): void {
  if (saved && saved !== server) void api.saveProfile({ lang: saved });
}
