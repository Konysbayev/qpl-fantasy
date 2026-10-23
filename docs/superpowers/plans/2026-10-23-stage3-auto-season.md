# Этап 3: автоматический сезон в облаке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** облако само загружает календарь и матчи с kffleague.kz, считает очки команд и места, меняет цены между турами и шлёт уведомления в Telegram — без ручных `rehearsal` + `deploy:seed`.

**Architecture:** одна Edge Function `cron-tick`, которую `pg_cron` + `pg_net` вызывают каждые 15 минут с секретным заголовком. За один вызов она по шагам: календарь (раз в 3 часа) → идущие и недавно сыгранные матчи → статусы и очки туров → цены при закрытии тура → уведомления. Вся логика — в `packages/db/src/*` (Node-тесты на локальном Postgres), функция только связывает шаги. Исправления цифр делает Claude скриптом через Management API.

**Tech Stack:** TypeScript, Postgres 16 (локально) / Supabase, `postgres@3.4.7`, Deno Edge Functions (esbuild-бандл, `npm:postgres`), pg_cron, pg_net, Vault, Telegram Bot API, vitest, React 18 (профиль).

**Spec:** `docs/design/2026-10-23-stage3-cloud-sync-draft.md` (решения владельца — в его конце) и разделы 4.2–4.4, 5.3–5.5, 7, 9 из `docs/superpowers/specs/2026-10-22-kpl-fantasy-design.md`.

## Global Constraints

- Частота: `cron-tick` — `*/15 * * * *`; календарь (карта сайта) — не чаще раза в 3 часа (`sync_state.key = 'calendar'`).
- Бережная нагрузка: между запросами к kffleague.kz ≥ 3000 мс (`createPoliteFetcher` по умолчанию); за один вызов ≤ 20 страниц; за сутки ≤ 300 запросов (`source_usage`); пути `/api/`, `/_next/` запрещены (уже в fetcher).
- Только Премьер-лига: 240 матчей сезона, остальные id — в `source_skip` (логика `syncSeason`).
- Время Edge Function: бесплатный тариф — 150 с на вызов и ~2 с процессорного времени; поэтому лимит страниц за вызов, никакой работы «на весь сезон» за раз.
- `manual_override = true` загрузчик не перезаписывает (уже в `upsertMatch`).
- Пересчёт очков всегда с нуля и идемпотентен: повторный вызов не меняет результат и не шлёт повторных уведомлений, не меняет цены второй раз.
- Цены — в десятых долях миллиона (40 = 4.0 млн); границы 35–120 (`clampPrice`); пороги в `seasons.price_steps`, по умолчанию `[[0.05,1],[0.10,2],[0.20,3]]` (спецификация 4.3).
- Штраф в `transfers.penalty` отрицательный (−4); итог тура = `points + penalty`.
- Время в текстах — Алматы, UTC+5 без перехода на летнее.
- Секреты (`TELEGRAM_BOT_TOKEN`, `CRON_SECRET`, `APP_URL`) — только в секретах Supabase / Vault; не в коде, коммитах и логах.
- Новые таблицы: `enable row level security` + `revoke all … from anon, authenticated` (как в 0004/0006).
- Комментарии в коде — на казахском, как в существующих файлах; тексты для пользователя — kk и ru.

## Review Focus

1. **Матч завис** (перенесён в день игры, сайт так и не поставил «finished»): тур не должен остаться «идёт» навсегда — через `lastKickoff + 48 ч` тур закрывается, зависший матч пишется в `audit_log` (`action = 'fixture_stuck'`). Тест — Task 4.
2. **Два вызова одновременно** (расписание + ручной вызов): второй сразу отвечает `{"skipped":"busy"}` (advisory lock), уведомления и цены не дублируются (сначала строка в `notifications_sent` / `price_changes`, потом действие). Тест — Task 7 и Task 6.
3. **kffleague.kz недоступен или разметка изменилась** посреди тура: страница → `failed` в отчёте, остальные шаги (очки, уведомления) всё равно выполняются, функция отвечает 200. Тест — Task 2 и Task 7.
4. **Пользователь заблокировал бота**: Telegram отвечает 403 → у него `notify.enabled = false`, `blocked = true`, рассылка идёт дальше. Тест — Task 6.
5. **Пропущенное окно напоминания** (расписание не работало): напоминание «за 24 ч» не шлётся, если до дедлайна уже меньше 2 часов; «за 2 ч» — не шлётся после дедлайна. Тест — Task 6.

---

### Task 1: Миграция 0007 — состояние синхронизации, уведомления, цены

**Files:**
- Create: `supabase/migrations/0007_auto_season.sql`
- Modify: `packages/db/test/schema.test.ts`

**Interfaces:**
- Produces (таблицы/колонки, на них опираются Task 2–9):
  - `fixtures.fetched_at timestamptz` (null — ни разу не загружали страницу);
  - `seasons.price_steps jsonb not null default '[[0.05,1],[0.10,2],[0.20,3]]'`;
  - `sync_state (key text primary key, at timestamptz not null)`;
  - `notifications_sent (gameweek_id uuid references gameweeks, kind text check (kind in ('deadline_24h','deadline_2h','results')), sent_at timestamptz not null default now(), primary key (gameweek_id, kind))`;
  - `price_changes (gameweek_id uuid primary key references gameweeks, applied_at timestamptz not null default now(), changed int not null)`.

- [ ] **Step 1: Тест в `schema.test.ts`** — `it('0007: новые таблицы закрыты для anon и authenticated, колонки на месте')`: после `freshDb` есть `fixtures.fetched_at`, `seasons.price_steps` по умолчанию равно `[[0.05,1],[0.1,2],[0.2,3]]`; `asRole(sql, 'anon', …)` и `'authenticated'` получают ошибку `permission denied` на `select` из `sync_state`, `notifications_sent`, `price_changes`; вторая вставка `notifications_sent` с той же парой `(gameweek_id, kind)` даёт `23505`.
- [ ] **Step 2:** `npx vitest run packages/db/test/schema.test.ts` → FAIL (нет колонки `fetched_at`).
- [ ] **Step 3:** написать `0007_auto_season.sql` по списку выше, с RLS и `revoke`.
- [ ] **Step 4:** тот же запуск → PASS; `npm test` целиком → PASS.
- [ ] **Step 5:** коммит `db: 0007 sync state, notifications, price changes`.

---

### Task 2: Загрузка идущих и недавно сыгранных матчей

**Files:**
- Create: `packages/db/src/auto-sync.ts`
- Modify: `packages/db/src/sync.ts` (вынести шаг «страница → upsert» в `fetchAndStore`; `upsertMatch` пишет `fetched_at = now()`)
- Test: `packages/db/test/auto-sync.test.ts`

**Interfaces:**
- Consumes: `upsertMatch`, `SyncReport`, `PoliteFetcher`, `RequestLimitError` (существующие).
- Produces:
  - `fetchAndStore(sql: postgres.Sql, fetcher: PoliteFetcher, opts: { seasonId: string; sourceSeasonId: number }, id: number, report: SyncReport): Promise<'stored' | 'skipped' | 'failed' | 'limit'>` в `sync.ts`; `syncSeason` переписан на него без изменения поведения (его тесты не трогать).
  - `matchesToRefresh(sql: postgres.Sql, seasonId: string, now: Date): Promise<number[]>` — `source_id` матчей, которые надо загрузить сейчас, по возрастанию `kickoff`:
    - идёт: `status <> 'finished'` и `kickoff <= now <= kickoff + 6 ч`;
    - повтор после финала: `status = 'finished'` и `kickoff + 4 ч <= now <= kickoff + 48 ч` и (`fetched_at is null` или `fetched_at < kickoff + 4 ч`).
  - `refreshMatches(sql, fetcher, opts: { seasonId: string; sourceSeasonId: number; ids: number[] }): Promise<SyncReport>` — по очереди `fetchAndStore`; при `'limit'` останавливается; никогда не бросает исключение из-за страницы.

- [ ] **Step 1: Тесты** (фейковый fetcher и страницы `match-1109/896/993.html.gz`, как в `sync.test.ts`; матчи заводятся через `upsertMatch`, затем `kickoff`/`status`/`fetched_at` правятся SQL):
  - `matchesToRefresh`: матч с `kickoff = now − 1 ч`, `status = 'live'` — в списке; `kickoff = now + 1 ч` — нет; `status = 'live'`, `kickoff = now − 7 ч` — нет; `finished`, `kickoff = now − 5 ч`, `fetched_at = kickoff + 2 ч` — в списке; тот же с `fetched_at = kickoff + 4.5 ч` — нет; `finished`, `kickoff = now − 3 дня` — нет.
  - `refreshMatches`: две страницы, первая отдаёт 500 — в отчёте `failed: [{id, error: 'HTTP 500'}]`, вторая `stored`, исключения нет; после загрузки у матча `fetched_at` не null.
  - `refreshMatches` с fetcher, бросающим `RequestLimitError` на втором id — `stored` содержит первый, `failed` — второй, третий не запрашивался.
  - строка `player_match_stats` с `manual_override = true` сохраняет свои значения после `refreshMatches` (повтор правила 9).
- [ ] **Step 2:** `npx vitest run packages/db/test/auto-sync.test.ts` → FAIL (нет модуля).
- [ ] **Step 3:** реализовать `fetchAndStore` (тело цикла `syncSeason`: запрос `/ru/matches/<id>`, проверка статуса, `parseMatchPage`, проверка сезона → `source_skip`, `upsertMatch`), `matchesToRefresh` (один SQL с интервалами), `refreshMatches`.
- [ ] **Step 4:** `npx vitest run packages/db` → PASS (включая старый `sync.test.ts`).
- [ ] **Step 5:** коммит `db: refresh live and recently finished matches`.

---

### Task 3: Календарь раз в 3 часа

**Files:**
- Modify: `packages/db/src/auto-sync.ts`
- Test: `packages/db/test/auto-sync.test.ts`

**Interfaces:**
- Consumes: `fetchAndStore` (Task 2), `parseSitemapMatches`, таблица `sync_state` (Task 1).
- Produces: `syncCalendar(sql, fetcher, opts: { seasonId: string; sourceSeasonId: number; year: number; now: Date; maxPages: number }): Promise<SyncReport & { ran: boolean; complete: boolean }>`.
  - Если `sync_state('calendar').at > now − 3 ч` → `{ ran: false }` без запросов.
  - Иначе `/sitemap.xml`; кандидаты: неизвестные id года `year` (правило 240/`source_skip` как в `syncSeason`) и известные незавершённые матчи сезона, у которых дата в карте сайта в окне `[сегодня − 1 день, сегодня + 14 дней]`. Порядок: сначала `fetched_at is null`, потом старые `fetched_at`. Не больше `maxPages` страниц.
  - `sync_state('calendar')` обновляется на `now` только если обработаны все кандидаты (`complete: true`); иначе следующий вызов продолжит с самых давно загруженных.

- [ ] **Step 1: Тесты:** карта сайта из 3 матчей года 2026 и 1 матча 2025; `maxPages = 2` → `complete: false`, `sync_state` пуст, 2 страницы; второй вызов → оставшаяся страница, `complete: true`, `sync_state.at = now`; третий вызов через 1 ч → `ran: false`, fetcher не вызывался; через 3 ч 1 мин → снова `ran: true`. Матч с датой в карте сайта через 20 дней не запрашивается. Карта сайта отдаёт 503 → `failed` с `'sitemap HTTP 503'`, исключения нет, `sync_state` не обновлён.
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализовать `syncCalendar`.
- [ ] **Step 4:** `npx vitest run packages/db/test/auto-sync.test.ts` → PASS.
- [ ] **Step 5:** коммит `db: calendar sync every 3 hours with page budget`.

---

### Task 4: Статусы туров и очки команд

**Files:**
- Create: `packages/db/src/finalize.ts`
- Modify: `packages/db/src/team-view.ts` (экспортировать `gameweekPoints`, логику не менять)
- Test: `packages/db/test/finalize.test.ts`

**Interfaces:**
- Consumes: `ensureSquadTx`, `scoreGameweekTeam`, `gameweekPoints(sql, gameweekId, squadIds): Promise<Map<string, PlayerGameweek>>`.
- Produces:
  - `type GwStatus = 'upcoming' | 'open' | 'live' | 'played' | 'closed'` (значения колонки `gameweeks.status`).
  - `gameweekPhase(g: { deadline: Date; fixtures: { kickoff: Date; status: string }[] }, now: Date): Exclude<GwStatus, 'upcoming'>`: `deadline > now` → `open`; есть незавершённый матч и `now < lastKickoff + 48 ч` → `live`; все матчи `finished` и `now < lastKickoff + 26 ч` → `played`; иначе `closed`. Чистая функция в `finalize.ts`.
  - `scoreGameweek(sql, gameweekId: string): Promise<{ scored: number }>`: для каждого пользователя, у которого есть состав в сезоне с дедлайном раньше этого тура, — `ensureSquadTx` на этот тур; очки `scoreGameweekTeam`; `penalty = sum(transfers.penalty)` пользователя за тур; upsert в `gameweek_scores (points, penalty)`; затем для всех строк этого тура `season_total = сумма (points + penalty)` по турам сезона с дедлайном ≤ этого, `rank = rank() over (order by season_total desc, платных трансферов за сезон asc)`.
  - `advanceGameweeks(sql, seasonId: string, now: Date): Promise<{ gameweekId: string; number: number; from: GwStatus; to: GwStatus }[]>`: для туров с `deadline <= now` и `status <> 'closed'` — новый статус по `gameweekPhase`; для `live`/`played`/`closed` вызывает `scoreGameweek`; при переходе в `closed` с незавершёнными матчами пишет `audit_log (action = 'fixture_stuck', payload = { fixtureIds })`; возвращает только реальные смены статуса.

- [ ] **Step 1: Тесты** (`seedLeague`, `newUser`, `standardPicks` из `packages/db/test/league.ts`):
  - `gameweekPhase` — все пять веток, включая «матч не завершён, `now = lastKickoff + 49 ч`» → `closed`.
  - два пользователя с одинаковыми составами, у второго трансфер со штрафом −4 → у обоих одинаковые `points`, у второго `penalty = −4`, `rank` 1 и 2; при равных `season_total` выше тот, у кого меньше платных трансферов.
  - пользователь собрал состав на тур 1 и пропал → на тур 2 состав скопирован (`ensureSquadTx`), очки посчитаны.
  - пользователь без состава в сезоне → строки в `gameweek_scores` нет.
  - двойной вызов `scoreGameweek` → те же строки (идемпотентность); правка `player_match_stats.points` и повторный вызов → новые очки.
  - `advanceGameweeks`: тур с дедлайном в прошлом и незавершённым матчом → переход `upcoming → live`; после завершения всех матчей → `live → played`; через 26 ч → `played → closed`; повторный вызов без изменений времени → пустой список. Зависший матч → `closed` через 48 ч и строка `fixture_stuck` в `audit_log`.
- [ ] **Step 2:** `npx vitest run packages/db/test/finalize.test.ts` → FAIL.
- [ ] **Step 3:** реализовать; ранжирование одним SQL с оконной функцией; всё для одного тура — в одной транзакции.
- [ ] **Step 4:** `npx vitest run packages/db` → PASS (team-view не сломан).
- [ ] **Step 5:** коммит `db: gameweek phases, team scores, season ranks`.

---

### Task 5: Цены между турами

**Files:**
- Create: `packages/db/src/prices.ts`
- Test: `packages/db/test/prices.test.ts`

**Interfaces:**
- Consumes: `priceDelta`, `clampPrice`, `PriceThresholds` из `packages/core/src/squad.ts`; `price_changes`, `seasons.price_steps` (Task 1).
- Produces: `applyPriceChanges(sql, seasonId: string, gameweekId: string, now: Date): Promise<{ changed: number } | null>` — `null`, если для тура уже есть строка в `price_changes`. Окно: трансферы с `created_at` в `(предыдущий price_changes.applied_at сезона или -infinity, now]`; чистые покупки игрока = входы − выходы; участники = число пользователей с составом в сезоне; новая цена `clampPrice(price + priceDelta(net, managers, { steps: price_steps }))`. Строка `price_changes` вставляется в той же транзакции **до** обновления цен (`insert … on conflict do nothing returning`).

- [ ] **Step 1: Тесты:** 20 участников; игрока купили 1 (5%) → +1, 2 (10%) → +2, 4 (20%) → +3; продали 2 → −2; цена 119 и +3 → 120; цена 36 и −2 → 35; второй вызов для того же тура → `null`, цены не меняются; трансферы до предыдущего `applied_at` не учитываются; свой `price_steps` в сезоне `[[0.5,1]]` → при 10% нет изменения.
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** `npx vitest run packages/db/test/prices.test.ts` → PASS.
- [ ] **Step 5:** коммит `db: price changes between gameweeks`.

---

### Task 6: Уведомления в Telegram

**Files:**
- Create: `packages/db/src/notify.ts`, `packages/core/src/notify-texts.ts`
- Test: `packages/db/test/notify.test.ts`, `packages/core/test/notify-texts.test.ts`

**Interfaces:**
- Produces:
  - `type NotifyKind = 'deadline_24h' | 'deadline_2h' | 'results'`.
  - `notifyText(kind: NotifyKind, lang: 'kk' | 'ru', d: { gameweek: number; deadline?: Date; points?: number; rank?: number; managers?: number }): string` в `notify-texts.ts`. Тексты (время — `HH:MM` по Алматы, дата — `24.10`):
    - ru 24h: `⏰ {N}-й тур: дедлайн завтра, {дата} в {время}. Проверьте состав и капитана.`
    - ru 2h: `⏳ {N}-й тур: до дедлайна 2 часа (в {время}). Последний шанс на трансферы.`
    - ru results: `🏁 {N}-й тур сыгран: {очки} очк., место {место} из {всего}.`
    - kk 24h: `⏰ {N}-тур: дедлайн ертең, {дата} сағат {время}. Құрам мен капитанды тексеріңіз.`
    - kk 2h: `⏳ {N}-тур: дедлайнға 2 сағат қалды ({время}). Трансферге соңғы мүмкіндік.`
    - kk results: `🏁 {N}-тур аяқталды: {очки} ұпай, {всего} ішінен {место}-орын.`
  - `type Send = (chatId: number, text: string) => Promise<{ ok: boolean; status: number }>`.
  - `telegramSender(botToken: string, appUrl: string, fetchImpl?: typeof fetch): Send` — `POST https://api.telegram.org/bot<token>/sendMessage`, тело `{ chat_id, text, reply_markup: { inline_keyboard: [[{ text: 'Ойнау', web_app: { url: appUrl } }]] } }`; пауза 40 мс между сообщениями.
  - `dueReminders(sql, seasonId: string, now: Date): Promise<{ gameweekId: string; number: number; kind: 'deadline_24h' | 'deadline_2h'; deadline: Date }[]>`: `deadline_24h` — `deadline − 24 ч <= now < deadline − 2 ч`; `deadline_2h` — `deadline − 2 ч <= now < deadline`; без строки в `notifications_sent`.
  - `sendNotification(sql, send: Send, n: { gameweekId: string; number: number; kind: NotifyKind; deadline?: Date }): Promise<{ sent: number; failed: number } | null>` — сначала `insert into notifications_sent … on conflict do nothing returning`; нет строки → `null` (уже отправлено). Получатели: для напоминаний — пользователи с составом в сезоне; для итогов — пользователи со строкой `gameweek_scores` этого тура (очки = `points + penalty`, место = `rank`, всего = число строк тура). Пропускаются `notify->>'enabled' = 'false'`. Ответ 403 → `notify = notify || '{"enabled":false,"blocked":true}'`.

- [ ] **Step 1: Тесты:** `notifyText` для всех 6 вариантов с дедлайном `2026-10-31T09:00:00Z` → `31.10`, `14:00`; `dueReminders` в 4 момента (за 25 ч — пусто, за 23 ч — 24h, за 1 ч — 2h, через 1 мин после дедлайна — пусто) и пусто после записи в `notifications_sent`; `sendNotification` с фейковым `send`: 3 пользователя, один с `notify.enabled=false` (не получает), один отвечает 403 (становится `blocked`), язык текста по `users.lang`; повторный вызов → `null`, `send` не вызывался; `telegramSender` с фейковым `fetch` — URL, тело с `web_app.url`.
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** `npx vitest run packages/db/test/notify.test.ts packages/core/test/notify-texts.test.ts` → PASS.
- [ ] **Step 5:** коммит `notify: deadline reminders and gameweek results`.

---

### Task 7: Функция `cron-tick` и расписание

**Files:**
- Create: `supabase/functions/cron-tick/handler.ts`, `supabase/functions/cron-tick/index.ts`, `scripts/deploy/setup-cron.ts`, `scripts/deploy/test/setup-cron.test.ts`, `supabase/functions/test/cron-tick.test.ts`
- Modify: `supabase/config.toml` (`[functions.cron-tick] verify_jwt = false`), `package.json` (`"deploy:cron": "NODE_USE_ENV_PROXY=1 tsx scripts/deploy/setup-cron.ts"`), `scripts/deploy/seed-remote.ts` (отказ, если в облаке есть строки `price_changes`, без `--force`)

**Interfaces:**
- Consumes: всё из Task 2–6; `activeSeasonId` из `packages/db/src/squad.ts`; `recordRequest`; `createPoliteFetcher`; `runQuery`, `managementFetch`, `envOpts`, `literal` из `scripts/deploy/management.ts`.
- Produces:
  - `cronTick(req: Request, deps: { sql: postgres.Sql; cronSecret: string; now: Date; fetcher: (maxRequests: number) => PoliteFetcher; send: Send }): Promise<Response>`:
    1. заголовок `x-cron-secret` не равен `cronSecret` (сравнение постоянного времени) → 401;
    2. `pg_try_advisory_lock(hashtext('qpl-cron-tick'))` не взят → 200 `{ skipped: 'busy' }`; блокировка снимается в `finally`;
    3. нет активного сезона → 200 `{ skipped: 'no_season' }`;
    4. бюджет = `min(20, 300 − source_usage за сегодня)`; при `≤ 0` шаги загрузки пропускаются;
    5. шаги по порядку, каждый в своём `try/catch` (ошибка → `report.errors[]` и `audit_log (action = 'cron_error')`, следующий шаг выполняется): `syncCalendar(maxPages = бюджет)` → `refreshMatches(matchesToRefresh)` → `advanceGameweeks` → для переходов в `played` `sendNotification('results')`, в `closed` `applyPriceChanges` → `dueReminders` → `sendNotification`;
    6. 200 и JSON-отчёт `{ calendar, matches, transitions, prices, notifications, errors }`.
  - `buildCronSql(projectRef: string): string` — SQL: `create extension if not exists pg_cron; create extension if not exists pg_net;` снятие старой задачи `qpl-cron-tick`, если есть; `cron.schedule('qpl-cron-tick', '*/15 * * * *', $$ select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/cron-tick', headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'qpl_cron_secret')), timeout_milliseconds := 140000) $$)`. Секрета в тексте нет.
  - `setup-cron.ts` main: секрет из `CRON_SECRET` окружения или случайные 64 hex; секреты функций `CRON_SECRET` и `APP_URL` (из окружения, по умолчанию `https://qpl-fantasy.pages.dev`) через `/secrets`; секрет в Vault (`vault.create_secret`, при повторе — `vault.update_secret` по имени `qpl_cron_secret`) через `runQuery` с `literal()`; затем `buildCronSql`. Печатает только имена.

- [ ] **Step 1: Тесты `cron-tick.test.ts`** (локальная база, `seedLeague`, фейковые fetcher и `send`): без заголовка → 401; при занятой блокировке (держит второе соединение) → `busy`; полный проход: тур с прошедшим дедлайном и завершёнными матчами → в отчёте переход `played`, `send` получил итоги; повторный вызов → переходов нет, `send` больше не вызывался; fetcher, бросающий исключение на календаре → 200, в `errors` одна запись, очки всё равно посчитаны; `source_usage` за сегодня = 300 → fetcher не создавался.
- [ ] **Step 2: Тест `setup-cron.test.ts`:** `buildCronSql('abc')` содержит `'*/15 * * * *'`, `https://abc.supabase.co/functions/v1/cron-tick`, `qpl_cron_secret`, `create extension if not exists pg_net` и не содержит переданного секрета.
- [ ] **Step 3:** запуск обоих → FAIL.
- [ ] **Step 4:** реализовать `handler.ts`, `index.ts` (как у `health`: `sql` и `secret()` из `_shared/env.ts`, `createPoliteFetcher({ maxRequests, onRequest: () => recordRequest(sql) })`, `telegramSender(secret('TELEGRAM_BOT_TOKEN'), secret('APP_URL'))`), `setup-cron.ts`, правки `config.toml`, `package.json`, `seed-remote.ts`.
- [ ] **Step 5:** `npm test` → PASS; `npm run typecheck` → код выхода 0.
- [ ] **Step 6: Проверка в настоящем Deno** на копии `qpl_cloud_sim`: `npx tsx scripts/deploy/build-functions.ts cron-tick`, запуск бандла в Deno 2 с `SUPABASE_DB_URL` локальной базы, `CRON_SECRET=test`, вызов `curl -H 'x-cron-secret: test'` при `now` в день матча; ожидается 200 и в отчёте загруженные страницы. Замерить время разбора одной страницы матча (`performance.now()` вокруг `parseMatchPage` + `upsertMatch`); ожидается < 500 мс. Если больше — уменьшить лимит страниц за вызов до 5 и записать решение в отчёт задачи.
- [ ] **Step 7:** коммит `cron-tick: scheduled season automation`.

---

### Task 8: Профиль — уведомления и язык на сервере

**Files:**
- Create: `supabase/functions/profile-save/handler.ts`, `supabase/functions/profile-save/index.ts`
- Modify: `packages/db/src/users.ts`, `supabase/functions/auth-telegram/handler.ts`, `supabase/functions/_shared/http.ts` (`LIMITS['profile-save'] = 20`), `supabase/config.toml`, `apps/web/src/api.ts`, `apps/web/src/App.tsx`, `apps/web/src/screens/Profile.tsx`, `apps/web/src/i18n/kk.ts`, `apps/web/src/i18n/ru.ts`
- Test: `packages/db/test/users.test.ts`, `supabase/functions/test/profile-save.test.ts`, `apps/web/test/profile.test.tsx` (новый)

**Interfaces:**
- Produces:
  - `saveProfile(sql, userId: string, p: { lang?: 'kk' | 'ru'; notify?: boolean }): Promise<{ lang: 'kk' | 'ru'; notify: boolean }>` — `notify` пишет `users.notify = notify || {"enabled": <bool>}` (флаг `blocked` сбрасывается при включении).
  - `Session.user` получает `notify: boolean` (`notify->>'enabled'` не равно `'false'`).
  - `POST /functions/v1/profile-save` с сессией: тело `{ lang?, notify? }`, неверные значения → 400; ответ `{ ok: true, value: { lang, notify } }`; 429 по лимиту.
  - `api.saveProfile(p): Promise<ApiResult<{ lang: Lang; notify: boolean }>>`.
  - Профиль: переключатель «Уведомления в боте» / «Боттағы хабарламалар»; смена языка тоже вызывает `saveProfile` (тексты уведомлений приходят на выбранном языке).

- [ ] **Step 1: Тесты:** `saveProfile` меняет язык и флаг, `blocked` сбрасывается при `notify: true`; функция: без сессии 401, `{ lang: 'en' }` → 400, 21-й вызов за минуту → 429; веб: переключатель вызывает `api.saveProfile({ notify: false })`, смена языка — `api.saveProfile({ lang: 'ru' })`, при ошибке переключатель возвращается назад.
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run web:build` → все с кодом 0; `npm run web:screens` → обновлённые скриншоты профиля в `docs/design/screens/`.
- [ ] **Step 5:** коммит `profile: notification toggle and server-side language`.

---

### Task 9: Исправление цифр по запросу владельца

**Files:**
- Create: `scripts/admin/override-stat.ts`, `scripts/admin/test/override-stat.test.ts`
- Modify: `package.json` (`"admin:override": "NODE_USE_ENV_PROXY=1 tsx scripts/admin/override-stat.ts"`)

**Interfaces:**
- Consumes: `runQuery`, `literal`, `envOpts`; `scorePlayer`, `ScoringRules`, тип `PlayerMatchStat` из `packages/core/src/types.ts`.
- Produces: `buildOverrideSql(row: { fixtureId: string; playerId: string; position: Position; rules: ScoringRules; current: PlayerMatchStat }, change: Partial<Pick<PlayerMatchStat, 'minutes' | 'goals' | 'assists' | 'penaltyGoals' | 'ownGoals' | 'yellow' | 'red' | 'conceded' | 'penaltiesSaved' | 'penaltiesMissed'>>, reason: string): string` — один SQL в транзакции: обновить поля и `points`/`points_lines` (пересчёт `scorePlayer`), `manual_override = true`; `audit_log (action = 'stat_override', payload = { fixtureId, playerId, before, after, reason })`; если тур этого матча уже `closed` — вернуть его в `played` (следующий `cron-tick` пересчитает очки и закроет снова; цены и уведомления повторно не сработают благодаря `price_changes` / `notifications_sent`).
- CLI: `npm run admin:override -- --fixture <source_id> --player "<фамилия>" --set goals=1,assists=0 --reason "протокол лиги"`; если по фамилии в матче найдено несколько игроков — ошибка со списком; сначала печатает «было → стало» и применяет только с `--apply`.

- [ ] **Step 1: Тесты** (`buildOverrideSql` выполняется на локальной базе после `upsertMatch` фикстуры `match-1109`): гол защитнику +1 → `points` выросли на 6, `manual_override = true`, запись в `audit_log` с `before`/`after`; закрытый тур стал `played`; повторная загрузка той же страницы (`upsertMatch`) не перезаписала строку.
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** `npx vitest run scripts/admin` → PASS.
- [ ] **Step 5:** коммит `admin: stat override script for owner requests`.

---

### Task 10: Выкладка и документы

**Files:**
- Modify: `docs/deploy/2026-10-22-stage2-launch.md` → раздел «Этап 3: автоматика», `docs/design/2026-10-23-stage3-cloud-sync-draft.md` (статус «реализовано»), `.github/workflows/ci.yml` (если новые тесты требуют новых баз — нет изменений, проверить)

Требует явного «можно выкладывать в Supabase» от владельца в сессии выкладки.

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run web:build` → код 0.
- [ ] **Step 2:** `npm run deploy:migrate` → `Применены: 0007_auto_season.sql`.
- [ ] **Step 3:** `npm run deploy:functions -- cron-tick profile-save auth-telegram` → три строки `выложено`.
- [ ] **Step 4:** `npm run deploy:cron` → `Секреты заданы: CRON_SECRET, APP_URL` и `Расписание qpl-cron-tick: */15 * * * *`.
- [ ] **Step 5:** проверка: `select jobname, schedule from cron.job` → одна строка; через ≤ 15 минут `select status_code from net._http_response order by created desc limit 1` → 200; `select count(*) from audit_log where action = 'cron_error'` → 0; ручной вызов без заголовка → 401.
- [ ] **Step 6:** документ: что делает автоматика, как попросить исправление («Claude, у игрока X в матче Y гол не засчитан»), что `deploy:seed` больше не запускать (защищён `price_changes`), как выключить расписание (`select cron.unschedule('qpl-cron-tick')`).
- [ ] **Step 7:** коммит `docs: stage 3 automation runbook`; PR в `main` после финального ревью.
