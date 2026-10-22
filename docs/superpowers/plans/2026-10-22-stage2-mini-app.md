# Этап 2: Mini App в Telegram — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Владелец открывает бота в Telegram, нажимает «Ойнау» и в Mini App собирает первый состав из настоящих игроков ҚПЛ, видит поле с очками, делает трансферы, выбирает капитана, смотрит карточку игрока и календарь тура. Всё по утверждённому дизайну C 3.1, в светлой и тёмной теме, на казахском и русском.

**Architecture:**
- База и серверные функции — Supabase (уже есть схема из этапа 1).
- Серверные функции (Edge Functions, Deno) — тонкие обёртки над пакетами `core` и `db`, собранные `esbuild` в один файл на функцию (так снимается разница импортов Node/Deno).
- Публичные данные (клубы, игроки, матчи, очки) приложение читает напрямую из Supabase по anon-ключу (RLS из этапа 1). Всё личное и любые изменения — только через функции.
- Mini App — `apps/web` (React + TypeScript + Vite), хостинг Cloudflare Pages (сборка из GitHub).
- Мини-лиги, бот-уведомления и админка — этап 3. Экран «Лигалар» в этом этапе показывает заглушку «Жақында».

**Tech Stack:** Node 22, TypeScript, React 18.3, Vite 5, vitest + @testing-library/react + jsdom, Playwright (уже в среде), esbuild, Supabase CLI (`npx supabase`), `postgres@3.4.7`, Telegram WebApp JS (`https://telegram.org/js/telegram-web-app.js`).

**Spec:** `docs/superpowers/specs/2026-10-22-kpl-fantasy-design.md` (разделы 3, 4, 5.1, 5.2, 8). Утверждённые макеты: `docs/design/project/SkyV3Chest.dc.html` (команда), `Transfer.dc.html`, `Player.dc.html`, `League.dc.html` и их `*Dark` варианты. Итоги этапа 1: `docs/research/2026-10-22-rehearsal-2026.md`.

## Global Constraints

- Цвета, шрифты, радиусы и тени — **ровно** как в макетах и таблице цветов спецификации 3.1 (токены светлой и тёмной темы). Шрифты Rubik (цифры, заголовки) и Nunito (текст) с Google Fonts.
- Тема берётся из `Telegram.WebApp.colorScheme` и меняется на лету по событию `themeChanged`.
- Все тексты интерфейса — из словарей `kk` и `ru`; язык по умолчанию — `language_code` пользователя Telegram (`ru` → русский, иначе казахский).
- Экран рассчитан на ширину 320–430 px; длинные фамилии обрезаются многоточием, ничего не вылезает за край.
- Сервер решает всё (спецификация 8): дедлайн по серверному времени, бюджет 100.0 млн, 2/5/5/3, ≤3 из клуба, −4 за лишний трансфер, Wildcard. Приложение только показывает и отправляет намерения.
- Деньги — целые в десятых долях миллиона (как в этапе 1). На экране — «6.0 млн».
- Секреты (токен бота, JWT-секрет проекта, ключ service role, токен доступа Supabase) — только в секретах Supabase и окружения. В коде, коммитах и логах их нет.
- Код серверных функций не импортирует `node:` модули напрямую; `node:fs` остаётся только в скриптах.
- Учитывается только Премьер-лига (спецификация 5.4).
- Комментарии в коде — короткие, по-казахски; тексты тестов — по-русски.

## Review Focus

1. **Дедлайн на границе.** Трансфер, отправленный за секунду до дедлайна, проходит; через секунду после — отклоняется понятным сообщением, состав не меняется. Тест в Task 4.
2. **Двойное нажатие.** Повторная отправка того же трансфера (сеть «моргнула») не списывает второй трансфер и не даёт второй штраф. Тест в Task 4.
3. **Чужая или старая подпись Telegram.** Подделанные `initData` и подпись старше 24 часов отклоняются; токен сессии с истёкшим сроком не принимается функциями. Тест в Task 3.
4. **Тур без нового состава.** Когда открывается следующий тур, состав переносится из прошлого автоматически (с банком и бесплатными трансферами +1, максимум 5). Тест в Task 4.
5. **Маленький экран и длинные имена.** На ширине 320 px поле, список трансферов и карточка игрока не ломаются, «Жақсылықов»-длинные фамилии обрезаются. Скриншот-проверка в Task 6 и Task 9.

## Структура файлов

```
qpl-fantasy/
├── packages/core/src/pricing.ts            # draftPrices(): стартовые цены по статистике 2026
├── packages/core/src/difficulty.ts         # fixtureDifficulty(): сложность соперника по таблице
├── packages/auth/src/telegram.ts           # verifyInitData(), signSession(), verifySession() на WebCrypto
├── packages/db/src/squad.ts                # createFirstSquad(), saveLineup(), commitTransfers(), ensureSquad()
├── packages/db/src/team-view.ts            # loadTeamView(): всё для экрана «Менің командам»
├── supabase/functions/<name>/index.ts      # auth-telegram, team-view, squad-save, transfer-commit, health
├── supabase/seed/clubs.json                # код клуба (ҚАЙ…), цвета формы и полоски для 16 клубов
├── scripts/deploy/                         # build-functions.ts, migrate-remote.ts, seed-remote.ts
├── apps/web/
│   ├── index.html, vite.config.ts, src/main.tsx
│   ├── src/theme/          # tokens.ts (свет/тьма из спецификации 3.1), ThemeProvider.tsx
│   ├── src/i18n/           # kk.ts, ru.ts, useT.ts
│   ├── src/telegram.ts     # обёртка Telegram.WebApp с запасным режимом для браузера
│   ├── src/api.ts          # вход, чтение публичных данных, вызовы функций
│   ├── src/components/     # Kit, PlayerToken, Pitch, Chip3D, BottomNav, Sheet
│   ├── src/screens/        # Team, Transfer, Builder, PlayerCard, Schedule, Profile, LeaguesSoon
│   └── public/clubs/       # логотипы клубов
└── apps/web/test/
```

---

### Task 0 (владелец проекта): аккаунты и доступы

Это не код, это делает владелец по подсказкам Claude. Без этого нельзя ничего выложить (Task 1).

1. **Supabase:** зарегистрироваться на supabase.com, создать проект `qpl-fantasy` (регион — ближайший: Frankfurt). Передать Claude: **Project ref** (часть адреса проекта).
2. **Токен доступа Supabase:** Account → Access Tokens → Generate. Добавить в секреты окружения Claude как `SUPABASE_ACCESS_TOKEN`. **В чат не вставлять.**
3. **Сеть окружения:** в Allowed domains добавить `api.supabase.com` и `*.supabase.co`.
4. **Бот:** в Telegram у @BotFather — `/newbot`, имя «QPL Fantasy», логин вроде `qplfantasy_bot`; аватар — `brand/qpl-telegram-avatar-640.png`. Токен бота добавить в секреты окружения как `TELEGRAM_BOT_TOKEN`. **В чат не вставлять.**
5. **Cloudflare:** зарегистрироваться на cloudflare.com → Workers & Pages → Create → Pages → Connect to Git → репозиторий `qpl-fantasy`. Настройки сборки Claude пришлёт в Task 11.

### Task 1: выкладка — проверка пути от начала до конца

**Files:**
- Create: `scripts/deploy/build-functions.ts`, `scripts/deploy/migrate-remote.ts`, `supabase/functions/health/index.ts`, `supabase/config.toml`
- Test: `scripts/deploy/test/migrate-remote.test.ts`

**Interfaces:**
- Produces:
```ts
// build-functions.ts: esbuild собирает supabase/functions/<name>/index.ts → supabase/functions/<name>/dist/index.js (format esm, platform neutral, external: npm:*)
export async function buildFunctions(names: string[]): Promise<string[]>;
// migrate-remote.ts: применяет supabase/migrations/*.sql через Management API (HTTPS), учёт в schema_migrations
export async function migrateRemote(opts: { projectRef: string; token: string; fetchImpl?: typeof fetch; dir: string }): Promise<string[]>;
```
Запрос SQL: `POST https://api.supabase.com/v1/projects/{ref}/database/query`, тело `{"query": "<sql>"}`, заголовок `Authorization: Bearer <token>`.

- [ ] **Step 1: Тесты `migrate-remote`** на поддельном fetch: применяет только новые файлы по порядку; уже применённые (ответ на `select name from schema_migrations`) пропускает; HTTP-ошибка → исключение с текстом ответа, без токена в сообщении.
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать** оба скрипта и функцию `health` (отвечает `{"ok":true,"time":<серверное время>}`). **Step 4: Запустить** → PASS.
- [ ] **Step 5: Выложить по-настоящему:** `npx tsx scripts/deploy/migrate-remote.ts` → три миграции этапа 1 применены; `npx supabase functions deploy health --project-ref <ref>` (токен из окружения); `curl https://<ref>.supabase.co/functions/v1/health` → `{"ok":true,...}`.
- [ ] **Step 6: Commit** `feat(deploy): remote migrations and function build`.

### Task 2: стартовые цены, клубы и данные сезона в облаке

**Files:**
- Create: `packages/core/src/pricing.ts`, `packages/core/src/difficulty.ts`, `supabase/seed/clubs.json`, `scripts/deploy/seed-remote.ts`
- Test: `packages/core/test/pricing.test.ts`, `packages/core/test/difficulty.test.ts`
- Result: `docs/research/<дата>-prices-draft.md` (таблица цен на утверждение владельцу)

**Interfaces:**
- Produces:
```ts
export interface PlayerSeason { id: string; position: Position; points: number; minutes: number }
export const PRICE_RULES = { min: 40, max: { GK: 60, DEF: 70, MID: 100, FWD: 100 }, minMinutes: 450, step: 5 } as const;
export function draftPrices(players: PlayerSeason[]): Map<string, number>;
// цена = 40 + (max − 40) × (очки / лучший по позиции)^0.7, округление вниз до шага 5 (0.5 млн); < 450 минут → 40
export type Difficulty = 'easy' | 'mid' | 'hard';
export function fixtureDifficulty(opponentRank: number, clubs: number): Difficulty; // верхняя треть таблицы — hard, нижняя — easy
```
`clubs.json`: для каждого из 16 клубов `source_id`, `code` (3 буквы по-казахски: ҚАЙ, АСТ, АҚТ, ОРД, ЕЛМ, ҚАС, ТОБ…), `kit: { shirt, sleeves, trim, strip: [c1, c2] }`. Для 6 клубов цвета взять из макета `SkyV3Chest.dc.html`, для остальных — по логотипу; помечены `"verify": true` для сверки владельцем. Логотипы: 6 из ассетов макета (без фона) + остальные по `logo_url` с kffleague.kz, в `apps/web/public/clubs/<source_id>.png|webp`.

- [ ] **Step 1: Тесты:** `draftPrices` — лучший нападающий 10.0, нападающий с половиной очков ≈ 7.0 (по формуле), игрок с 300 минутами 4.0, вратарь не дороже 6.0, все цены кратны 0.5; `fixtureDifficulty(1, 16) === 'hard'`, `(8, 16) === 'mid'`, `(16, 16) === 'easy'`.
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать.** **Step 4: Запустить** → PASS.
- [ ] **Step 5:** `seed-remote.ts` выгружает из локальной `qpl_rehearsal` сезон 2026 (клубы + `clubs.json`, игроки с ценами из `draftPrices`, туры, матчи, статистика) пачками по 500 строк через Management API; повторный запуск обновляет, а не дублирует (`on conflict`). Записать отчёт с ценами по клубам. Запустить на облаке, сверить `select count(*)` (16 клубов, 240 матчей).
- [ ] **Step 6: Commit** `feat: draft prices, fixture difficulty and cloud seed`.

### Task 3: вход через Telegram

**Files:**
- Create: `packages/auth/src/telegram.ts`, `supabase/functions/auth-telegram/index.ts`
- Test: `packages/auth/test/telegram.test.ts`

**Interfaces:**
- Produces:
```ts
export interface TelegramUser { id: number; first_name: string; last_name?: string; username?: string; language_code?: string }
export async function verifyInitData(initData: string, botToken: string, nowSec: number, maxAgeSec?: number): Promise<TelegramUser | null>; // maxAgeSec = 86400
export async function signSession(payload: { sub: string; tg: number }, secret: string, nowSec: number, ttlSec?: number): Promise<string>; // HS256 JWT, ttl 7 дней
export async function verifySession(token: string, secret: string, nowSec: number): Promise<{ sub: string; tg: number } | null>;
```
Проверка подписи — по документации Telegram: `secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)`, `hash = hex(HMAC_SHA256(key=secret_key, msg=data_check_string))`, строки `key=value`, отсортированные по ключу, через `\n`, без `hash`. Только WebCrypto (`crypto.subtle`).

Функция `auth-telegram`: принимает `{ initData }`, проверяет, создаёт или обновляет `users` (telegram_id, display_name, lang), отвечает `{ token, user: { id, displayName, lang } }`. Секреты функции: `TELEGRAM_BOT_TOKEN`, `SESSION_SECRET`.

- [ ] **Step 1: Тесты** (initData собирается в тесте тем же алгоритмом с тестовым токеном): верная подпись → пользователь; изменённое поле → `null`; подпись старше 24 ч → `null`; чужой токен бота → `null`; `verifySession` — свой токен принят, изменённый отклонён, просроченный отклонён.
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать** + функцию. **Step 4: Запустить** → PASS.
- [ ] **Step 5: Commit** `feat(auth): Telegram initData verification and sessions`.

### Task 4: составы и трансферы на сервере

**Files:**
- Create: `packages/db/src/squad.ts`, `packages/db/src/team-view.ts`, `supabase/functions/{team-view,squad-save,transfer-commit}/index.ts`, `supabase/migrations/0004_transfer_idempotency.sql`
- Test: `packages/db/test/squad.test.ts`, `packages/db/test/team-view.test.ts`

**Interfaces:**
- Consumes: `validateSquad`, `transferPenalty`, `nextFreeTransfers`, `canUseWildcard`, `isValidFormation`, `scoreGameweekTeam` (core); схема этапа 1.
- Produces:
```ts
export type SquadFailure = 'deadline_passed' | 'invalid_squad' | 'invalid_lineup' | 'not_owned' | 'wildcard_unavailable' | 'no_open_gameweek';
export type Result<T> = { ok: true; value: T } | { ok: false; error: SquadFailure; details?: string[] };
export async function currentGameweek(sql, seasonId: string, now: Date): Promise<{ id: string; number: number; deadline: Date } | null>; // первый тур с дедлайном > now
export async function ensureSquad(sql, userId: string, gameweekId: string): Promise<string | null>; // перенос из прошлого тура: банк, free = nextFreeTransfers(остаток)
export async function createFirstSquad(sql, userId: string, now: Date, picks: { playerId: string; slot: number; isCaptain: boolean; isVice: boolean }[]): Promise<Result<{ squadId: string }>>;
export async function saveLineup(sql, userId: string, now: Date, picks: { playerId: string; slot: number; isCaptain: boolean; isVice: boolean }[]): Promise<Result<null>>;
export async function commitTransfers(sql, userId: string, now: Date, req: { requestId: string; out: string[]; in: string[]; wildcard: boolean }): Promise<Result<{ penalty: number; freeLeft: number; bank: number }>>;
export async function loadTeamView(sql, userId: string, now: Date): Promise<TeamView>; // состав, игроки с очками тура, капитан, дедлайн, банк, бесплатные, очки тура (scoreGameweekTeam)
```
`0004`: таблица `transfer_requests(request_id uuid primary key, user_id, created_at)` — повтор того же `requestId` возвращает прежний результат без новых списаний. Продажа — по текущей цене игрока (спецификация 4.3). До дедлайна первого тура пользователя трансферы без ограничений (`unlimited`). Каждая функция: проверяет `Authorization: Bearer <session>` через `verifySession`, работает с `SUPABASE_DB_URL`.

- [ ] **Step 1: Тесты** (локальная база, `freshDb`): первый состав сохраняется; 4 из одного клуба → `invalid_squad` с `club_limit`; перед дедлайном (−1 с) трансфер проходит, после (+1 с) → `deadline_passed` и состав не изменился; 2 трансфера при 1 бесплатном → штраф −4; повтор того же `requestId` → тот же результат, штраф один; Wildcard второй раз в туры 1–15 → `wildcard_unavailable`; `ensureSquad` переносит состав и даёт +1 бесплатный (не больше 5); `saveLineup` со схемой 2 защитника → `invalid_lineup`; `loadTeamView` считает очки тура с капитаном ×2.
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать** модули и три функции. **Step 4: Запустить** весь набор → PASS.
- [ ] **Step 5: Выложить** функции и миграцию 0004 в облако (Task 1), проверить `team-view` с токеном тестового пользователя.
- [ ] **Step 6: Commit** `feat: squads, lineups and transfers on the server`.

### Task 5: каркас приложения — тема, языки, Telegram, API

**Files:**
- Create: `apps/web/{index.html,vite.config.ts,tsconfig.json}`, `apps/web/src/{main.tsx,App.tsx,telegram.ts,api.ts}`, `apps/web/src/theme/{tokens.ts,ThemeProvider.tsx}`, `apps/web/src/i18n/{kk.ts,ru.ts,useT.ts}`
- Test: `apps/web/test/theme.test.tsx`, `apps/web/test/i18n.test.ts`, `apps/web/test/api.test.ts`
- Modify: `package.json` (workspaces `apps/*`; скрипты `web:dev`, `web:build`), `vitest.config.ts` (jsdom для `apps/web/test`)

**Interfaces:**
- Produces:
```ts
export const LIGHT: Tokens; export const DARK: Tokens;   // значения из таблицы 3.1 и макетов (bg, card, card2, ink, muted, primary, lip, primaryText, soft, gold, goldLip, grass…)
export function useTheme(): Tokens;                        // по Telegram.WebApp.colorScheme, обновляется по themeChanged
export type Lang = 'kk' | 'ru'; export function useT(): (key: keyof typeof kk) => string;
export function tg(): { initData: string; colorScheme: 'light' | 'dark'; languageCode: string | null; haptic(type: 'light' | 'success' | 'error'): void; onTheme(cb: () => void): void };
// вне Telegram (браузер разработчика) tg() возвращает заглушку: initData = import.meta.env.VITE_DEV_INIT_DATA ?? ''
export const api: { login(): Promise<Session>; teamView(): Promise<TeamView>; players(): Promise<PlayerRow[]>; fixtures(gw: number): Promise<FixtureRow[]>; saveLineup(p): Promise<Result>; transfer(r): Promise<Result> };
```
- [ ] **Step 1: Тесты:** тёмная схема Telegram → `DARK.bg === '#0E1621'`, смена темы перерисовывает; словари `kk` и `ru` имеют одинаковые ключи; `language_code: 'ru'` → русский, `'kk'`/`'en'`/нет → казахский; `api.transfer` шлёт `Authorization: Bearer <token>` и возвращает ошибку сервера как `{ ok:false, error }`.
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать.** **Step 4: Запустить** → PASS; `npm run web:build` без ошибок.
- [ ] **Step 5: Commit** `feat(web): app shell with theme, i18n, Telegram and API`.

### Task 6: компоненты дизайна

**Files:**
- Create: `apps/web/src/components/{Kit,PlayerToken,Pitch,Chip3D,BottomNav,Sheet}.tsx`
- Test: `apps/web/test/components.test.tsx`, `apps/web/test/visual.spec.ts` (Playwright)

**Interfaces:**
- Produces:
```ts
<Kit kit={ClubKit} logoUrl={string} size={number} armband={'captain' | 'vice' | null} />  // SVG-футболка из SkyV3Chest: блик, складки, логотип на левой груди
<PlayerToken name={string} clubCode={string} strip={[string, string]} points={number | null} role={'captain' | 'vice' | null} kit={ClubKit} logoUrl={string} onClick={() => void} />
<Pitch rows={PlayerTokenProps[][]} />          // перспектива, полосы травы, шаңырақ в центральном круге
<Chip3D tone={'primary' | 'gold' | 'soft'}>…</Chip3D>
<BottomNav current={'team' | 'transfer' | 'leagues' | 'schedule'} onNavigate={(t) => void} />
<Sheet open={boolean} onClose={() => void}>…</Sheet>   // выезжает снизу, закрывается свайпом вниз и кнопкой
```
Разметку и стили переносить из макетов один к одному (размеры, тени, радиусы, пути SVG шаңырака из `brand/README.md`).

- [ ] **Step 1: Тесты:** капитан показывает значок «К» и золотую рамку, вице — «В»; у фамилии `text-overflow: ellipsis`; `BottomNav` помечает текущую вкладку `aria-current="page"`; `Sheet` закрывается по кнопке «Жабу».
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать.** **Step 4: Запустить** → PASS.
- [ ] **Step 5: Скриншоты** Playwright (Chromium из `/opt/pw-browsers`) страницы-витрины компонентов на 390×844 и 320×640 в обеих темах → `docs/design/screens/`. Сравнить глазами с макетом SkyV3Chest; расхождения исправить.
- [ ] **Step 6: Commit** `feat(web): design components`.

### Task 7: экран «Менің командам»

**Files:** Create `apps/web/src/screens/Team.tsx`; Test `apps/web/test/team.test.tsx`.

Шапка: очки тура, средний и лучший результат («—», пока нет таблицы этапа 3), дедлайн «12-тур · 24 қаз, 15:00»; поле 11 + запас 4; нажатие на игрока открывает карточку (Task 9); «Ауыстыру» в запасе — смена основы и запаса через `api.saveLineup` с проверкой схемы на клиенте (`isValidFormation`) до отправки.
- [ ] **Step 1: Тесты** на поддельном `api`: показывает 11 + 4, очки капитана ×2 в сумме тура, недопустимая замена (2 защитника) не отправляется и показывает подсказку, ошибка `deadline_passed` показывает «Дедлайн өтті».
- [ ] **Step 2–4:** FAIL → реализовать → PASS. **Step 5: Commit** `feat(web): my team screen`.

### Task 8: первый состав и трансферы

**Files:** Create `apps/web/src/screens/{Builder,Transfer}.tsx`; Test `apps/web/test/transfer.test.tsx`.

`Builder` — когда у пользователя ещё нет состава: пустое поле со слотами 2/5/5/3, выбор из списка, банк 100.0 млн, кнопка «Сақтау» активна только при валидном составе (`validateSquad`). `Transfer` — по макету `Transfer.dc.html`: банк, бесплатные, штраф; «Шығады → Кіреді»; поиск (без учёта регистра и казахских/русских вариантов букв: «Қайрат» находится по «кайрат»); фильтр позиций; список с ценой, очками и % выбора; клубы с 3/3 заблокированы с подписью; подтверждение показывает штраф заранее; `requestId` = `crypto.randomUUID()` на одно подтверждение.
- [ ] **Step 1: Тесты:** поиск «кайрат» находит игроков «Қайрат»; клуб 3/3 заблокирован; второй трансфер при 1 бесплатном показывает «−4»; двойное нажатие «Растау» отправляет один запрос; `Builder` не даёт сохранить 3 вратаря.
- [ ] **Step 2–4:** FAIL → реализовать → PASS. **Step 5: Commit** `feat(web): squad builder and transfers`.

### Task 9: карточка игрока

**Files:** Create `apps/web/src/screens/PlayerCard.tsx`; Test `apps/web/test/player-card.test.tsx`.

По макету `Player.dc.html`: баннер в цветах клуба, место под фото, 6 показателей сезона, последние 5 туров, следующие 3 матча со сложностью (`fixtureDifficulty`, текстом и цветом), кнопки «Капитан ету», «Вице-капитан» (через `saveLineup`), «Трансферге шығару» (открывает трансфер с этим игроком в «Шығады»).
- [ ] **Step 1: Тесты:** сложность выводится словом («Қиын»), не только цветом; «Капитан ету» отправляет состав с новым капитаном, а прежний капитан становится обычным игроком; у игрока не из состава кнопок капитана нет.
- [ ] **Step 2–4:** FAIL → реализовать → PASS. **Step 5: Скриншоты** 390×844 и 320×640, обе темы. **Step 6: Commit** `feat(web): player card`.

### Task 10: «Кесте», профиль и заглушка лиг

**Files:** Create `apps/web/src/screens/{Schedule,Profile,LeaguesSoon}.tsx`; Test `apps/web/test/schedule.test.tsx`.

«Кесте» — матчи тура: время, логотипы, счёт или «LIVE», переключение туров стрелками. Профиль — язык (kk/ru), тема «как в Telegram». «Лигалар» — карточка «Жақында: мини-лигалар» (этап 3).
- [ ] **Step 1: Тесты:** тур переключается стрелками; сыгранный матч показывает счёт, будущий — время по Алматы (UTC+5); смена языка меняет подписи сразу.
- [ ] **Step 2–4:** FAIL → реализовать → PASS. **Step 5: Commit** `feat(web): schedule, profile and leagues placeholder`.

### Task 11: выкладка и проверка владельцем в Telegram

- [ ] **Step 1:** Cloudflare Pages: Build command `npm ci && npm run web:build`, output `apps/web/dist`, переменные `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (публичный anon-ключ). Выложить ветку.
- [ ] **Step 2:** У @BotFather: `/setmenubutton` → адрес Pages, текст «Ойнау»; `/newapp` при необходимости.
- [ ] **Step 3:** Выложить все функции и секреты (`TELEGRAM_BOT_TOKEN`, `SESSION_SECRET`) — `npx supabase secrets set` из окружения.
- [ ] **Step 4: Проверка владельцем** на телефоне: вход, сборка первого состава, капитан, трансфер, карточка игрока, «Кесте», смена языка, светлая и тёмная тема Telegram. Если успеваем до дедлайна 30-го тура ҚПЛ-2026 (31 октября, 14:00 по Алматы) — играем на нём по-настоящему; если нет — тестовый тур с дедлайном, который выставит Claude.
- [ ] **Step 5:** Замечания владельца — исправления через TDD в задаче, которой принадлежит код. **Commit** и `git push`.

---

## Что получит владелец после этапа 2

Бот QPL Fantasy в Telegram: открываешь, собираешь команду из настоящих игроков ҚПЛ, ставишь капитана, делаешь трансферы и видишь очки на поле — в нашем дизайне, на казахском и русском, в светлой и тёмной теме.
