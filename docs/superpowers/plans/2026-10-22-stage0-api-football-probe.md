# Этап 0: проверка API-Football по ҚПЛ — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ответить фактами на открытые вопросы 1–4 спецификации: даёт ли API-Football (бесплатный тариф) текущий сезон ҚПЛ, какие данные по ҚПЛ реально приходят и возвращает ли один запрос по матчу всё сразу. Результат — отчёт на русском языке и переиспользуемый клиент API для этапа 1.

**Architecture:** Маленький TypeScript-клиент API-Football (только `fetch`, без Node-специфики, чтобы потом работать в Supabase Edge Functions на Deno) плюс чистые функции анализа ответов и скрипт-зонд. Зонд делает не больше 25 запросов, сохраняет сырые ответы и пишет отчёт. Вся логика проверяется тестами на поддельных ответах **до** того, как тратить настоящие запросы.

**Tech Stack:** Node 22, TypeScript (ESM), vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-10-22-kpl-fantasy-design.md` (разделы 5.4, 12)

## Global Constraints

- Ключ API читается только из переменной окружения `API_FOOTBALL_KEY`; ключ никогда не попадает в код, коммиты, логи, сырые файлы и тексты ошибок.
- Базовый адрес API: `https://v3.football.api-sports.io`, заголовок ключа: `x-apisports-key`.
- Бесплатный тариф: 100 запросов в день и 10 в минуту. Зонд: **не больше 25 запросов за запуск** и **не меньше 7 секунд между запросами**.
- Код клиента (`packages/api-football/src/`) использует только стандартный `fetch` и не импортирует модули Node (`fs`, `path` и т. п.).
- ID лиги в коде не хардкодится, а ищется через API (страна `Kazakhstan`, тип `League`, название содержит `Premier`).
- Отчёт пишется на русском, файл `docs/research/<YYYY-MM-DD>-api-football-kpl.md`.
- Порог оценки показателя: ✅ если ≥ 90% игроков/событий, ⚠️ если 30–90%, ❌ если < 30%.

## Review Focus

1. **Бесплатный тариф закрывает сезоны 2026/2027.** API отвечает ошибкой вида `{"plan": "Free plans do not have access to this season, try from 2021 to 2023."}`. Зонд не должен падать: он фиксирует блокировку и берёт для оценки качества данных последний разрешённый сезон из текста ошибки (тест в Task 3).
2. **Лимит 10 запросов в минуту.** Ответ с `errors.rateLimit` или HTTP 429 → понятная ошибка, а не падение. Пауза 7 секунд между запросами (тесты в Task 1 и Task 3).
3. **В Казахстане несколько турниров** (Премьер-лига, Первая лига, Кубок, Суперкубок). Выбирается только Премьер-лига с типом `League` (тест в Task 2).
4. **Матч без данных об игроках** (пустой массив `players`). Доли показателей = 0, а не `NaN`, и отчёт пишет «нет данных» (тест в Task 2).
5. **Утечка ключа.** Ни ошибка клиента, ни сохранённые сырые файлы не содержат ключа (тесты в Task 1 и Task 3).

## Структура файлов

```
qpl-fantasy/
├── package.json, tsconfig.json, vitest.config.ts, .gitignore, .env.example
├── packages/api-football/src/
│   ├── types.ts          # минимальные типы ответов API, только используемые поля
│   ├── client.ts         # запросы, ключ, разбор ошибок, счётчик запросов
│   └── coverage.ts       # поиск ҚПЛ, покрытие сезона, оценка матча
├── packages/api-football/test/
│   ├── client.test.ts
│   ├── coverage.test.ts
│   └── samples.ts        # поддельные ответы API в форме настоящих
├── scripts/probe/
│   ├── probe.ts          # runProbe(): ход проверки, без доступа к диску
│   ├── report.ts         # renderReport(): отчёт на русском
│   └── main.ts           # запуск: env, пауза, сохранение файлов
├── scripts/probe/test/
│   ├── probe.test.ts
│   └── report.test.ts
├── docs/research/        # отчёт (коммитится)
└── research/raw/         # сырые ответы API (коммитятся, ключа в них нет)
```

---

### Task 0 (владелец проекта): подготовка доступа

Это делает владелец, не код. Без этих шагов Task 4 не запустить.

- [ ] **Шаг 1.** Завести репозиторий на GitHub (например, `qpl-fantasy`), чтобы Claude отправил туда текущую работу. Новая сессия начнётся из этого репозитория.
- [ ] **Шаг 2.** Зарегистрироваться на dashboard.api-football.com (бесплатный тариф) и скопировать API-ключ. **Не присылать ключ в чат.**
- [ ] **Шаг 3.** В настройках облачной среды (меню среды в заголовке сессии → Edit) добавить ключ в **Network secrets** (если такой раздел есть), иначе как переменную окружения `API_FOOTBALL_KEY`.
- [ ] **Шаг 4.** Там же в **Network access → Allowed domains** добавить `v3.football.api-sports.io` (и `registry.npmjs.org`, если доступ ограничен).
- [ ] **Вариант через RapidAPI** (если dashboard.api-football.com не открывается): подписка на API-Football (тариф Basic, $0) на rapidapi.com; ключ — переменная `RAPIDAPI_KEY` вместо `API_FOOTBALL_KEY`; домен — `api-football-v1.p.rapidapi.com` вместо `v3.football.api-sports.io`. Код выбирает поставщика сам: если задан `API_FOOTBALL_KEY` — напрямую, иначе RapidAPI.
- [ ] **Шаг 5.** Открыть новую сессию с репозиторием `qpl-fantasy`: новые секреты подхватываются только новой сессией.

---

### Task 1: клиент API-Football

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `packages/api-football/src/types.ts`, `packages/api-football/src/client.ts`
- Test: `packages/api-football/test/client.test.ts`

**Interfaces:**
- Produces:
  - `createApiFootballClient(opts: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch }): ApiFootballClient`
  - `interface ApiFootballClient { get<T>(path: string, params?: Record<string, string | number>): Promise<ApiResult<T>>; requestCount(): number }`
  - `type ApiResult<T> = { ok: true; response: T; results: number; raw: unknown } | { ok: false; kind: 'http' | 'api' | 'network'; status?: number; message: string; errorKey?: string; raw?: unknown }`

- [ ] **Шаг 1: настроить проект.** `package.json` с `"type": "module"`, скрипты `"test": "vitest run"` и `"probe": "tsx scripts/probe/main.ts"`, devDependencies: `typescript`, `vitest`, `tsx`, `@types/node`. В `.gitignore`: `node_modules`, `.env`. В `.env.example` одна строка: `API_FOOTBALL_KEY=`. `tsconfig.json`: `"strict": true`, `"module": "NodeNext"`, `"target": "ES2022"`.

- [ ] **Шаг 2: написать падающие тесты** `packages/api-football/test/client.test.ts` с поддельным `fetchImpl`:

```ts
it('шлёт ключ в заголовке и собирает адрес с параметрами', async () => {
  const calls: Request[] = [];
  const client = createApiFootballClient({ apiKey: 'SECRET', fetchImpl: fakeFetch(calls, 200, { errors: [], results: 1, response: [{ a: 1 }] }) });
  const r = await client.get('/fixtures', { league: 389, season: 2026 });
  expect(calls[0].url).toBe('https://v3.football.api-sports.io/fixtures?league=389&season=2026');
  expect(calls[0].headers.get('x-apisports-key')).toBe('SECRET');
  expect(r).toMatchObject({ ok: true, results: 1, response: [{ a: 1 }] });
  expect(client.requestCount()).toBe(1);
});

it('пустые errors в виде [] и {} считаются успехом', ...);  // оба варианта → ok: true

it('ошибка тарифа из errors-объекта', async () => {
  // ответ 200: { errors: { plan: 'Free plans do not have access to this season, try from 2021 to 2023.' }, results: 0, response: [] }
  expect(r).toMatchObject({ ok: false, kind: 'api', errorKey: 'plan', message: 'plan: Free plans do not have access to this season, try from 2021 to 2023.' });
});

it('лимит запросов: errors.rateLimit и HTTP 429', ...);  // → kind 'api' errorKey 'rateLimit'; → kind 'http' status 429

it('сетевая ошибка не роняет программу', ...);  // fetchImpl бросает TypeError → kind 'network'

it('ключ не попадает в текст ошибки', async () => {
  // fetchImpl бросает Error('connect failed for key SECRET'); и ответ 500 с телом, содержащим SECRET
  expect(JSON.stringify(r)).not.toContain('SECRET');
});
```

- [ ] **Шаг 3: запустить тесты, убедиться, что падают.** Команда: `npx vitest run packages/api-football/test/client.test.ts`. Ожидается: FAIL, `createApiFootballClient` не найден.

- [ ] **Шаг 4: реализовать** `types.ts` (поля из раздела «Типы» ниже) и `client.ts`. Сообщение ошибки собирается как `ключ: значение` через `; `. Перед возвратом любой текст ошибки прогоняется через замену значения `apiKey` на `***`. `requestCount()` растёт на каждый вызов `fetch`, включая неудачные.

- [ ] **Шаг 5: запустить тесты, убедиться, что проходят.** Команда: `npx vitest run packages/api-football/test/client.test.ts`. Ожидается: PASS, 6 тестов.

- [ ] **Шаг 6: коммит.** `git add -A && git commit -m "feat(api-football): add API-Football client with error handling"`

**Типы (`types.ts`), только используемые поля:**
- `LeagueEntry { league: { id: number; name: string; type: string }; country: { name: string }; seasons: SeasonEntry[] }`
- `SeasonEntry { year: number; start: string; end: string; current: boolean; coverage: { fixtures: { events: boolean; lineups: boolean; statistics_fixtures: boolean; statistics_players: boolean }; standings: boolean; players: boolean; injuries: boolean } }`
- `FixtureEntry { fixture: { id: number; date: string; status: { short: string } }; teams: { home: TeamRef; away: TeamRef }; goals: { home: number | null; away: number | null }; events?: EventEntry[]; lineups?: unknown[]; players?: TeamPlayers[] }`
- `EventEntry { type: string; detail: string; player: { id: number | null }; assist: { id: number | null } }`
- `TeamPlayers { team: TeamRef; players: { player: { id: number; name: string }; statistics: PlayerStat[] }[] }`
- `PlayerStat { games: { minutes: number | null; position: string | null; rating: string | null }; goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null }; cards: { yellow: number | null; red: number | null }; penalty: { saved: number | null; missed: number | null } }`
- `StatusInfo { subscription: { plan: string }; requests: { current: number; limit_day: number } }`

---

### Task 2: анализ ответов: поиск ҚПЛ, покрытие сезона, оценка матча

**Files:**
- Create: `packages/api-football/src/coverage.ts`
- Test: `packages/api-football/test/coverage.test.ts`, `packages/api-football/test/samples.ts`

**Interfaces:**
- Consumes: типы из Task 1.
- Produces:
  - `findKpl(leagues: LeagueEntry[]): LeagueEntry | undefined`
  - `seasonCoverage(entry: LeagueEntry, year: number): SeasonCoverage | undefined`, где `SeasonCoverage = { year: number; current: boolean; start: string; end: string; events: boolean; lineups: boolean; fixtureStats: boolean; playerStats: boolean; injuries: boolean }`
  - `assessFixture(detail: FixtureEntry, players: TeamPlayers[] | null): FixtureAssessment`, где `FixtureAssessment = { fixtureId: number; label: string; status: string; bundled: boolean; lineups: boolean; goalEvents: number; goalEventsWithAssist: number; cardEvents: number; substEvents: number; playersWithMinutes: number; rates: { minutes: number; rating: number; assistsField: number; savesGk: number; conceded: number; cards: number } }`

- [ ] **Шаг 1: написать образцы ответов** в `samples.ts`: список лиг Казахстана (Премьер-лига `type: 'League'`, Первая лига, Кубок `type: 'Cup'`, Суперкубок), один завершённый матч с событиями (2 гола, у одного есть ассист, 1 автогол, 3 карточки, 4 замены), с составами и статистикой игроков (у вратаря `saves: 3`, рейтинг у половины игроков `null`).

- [ ] **Шаг 2: написать падающие тесты** `coverage.test.ts`:

```ts
it('находит именно Премьер-лигу, а не Кубок и не Первую лигу', () => {
  expect(findKpl(kazLeagues)?.league.name).toBe('Premier League');
});
it('возвращает покрытие нужного сезона или undefined', () => {
  expect(seasonCoverage(kpl, 2026)).toMatchObject({ year: 2026, events: true, playerStats: true });
  expect(seasonCoverage(kpl, 1999)).toBeUndefined();
});
it('оценивает матч: голы с ассистом считаются без автоголов и незабитых пенальти', () => {
  const a = assessFixture(finishedFixture, finishedFixture.players!);
  expect(a).toMatchObject({ goalEvents: 2, goalEventsWithAssist: 1, cardEvents: 3, substEvents: 4, bundled: true, lineups: true });
  expect(a.rates.rating).toBeCloseTo(0.5, 2);
  expect(a.rates.savesGk).toBe(1);
});
it('доли считаются только по игрокам, которые выходили на поле', ...);  // игрок с minutes 0/null не входит в знаменатель
it('матч без игроков: доли 0, не NaN', () => {
  const a = assessFixture({ ...finishedFixture, players: [] }, null);
  expect(a.playersWithMinutes).toBe(0);
  expect(Object.values(a.rates).every((v) => v === 0)).toBe(true);
  expect(a.bundled).toBe(false);
});
```

- [ ] **Шаг 3: запустить тесты, убедиться, что падают.** Команда: `npx vitest run packages/api-football/test/coverage.test.ts`. Ожидается: FAIL.

- [ ] **Шаг 4: реализовать** `coverage.ts`. Правила, которые не следуют из сигнатур:
  - `findKpl`: `country.name === 'Kazakhstan'`, `league.type === 'League'`, `/premier/i.test(league.name)`.
  - Голевые события: `type === 'Goal'` и `detail` не `'Own Goal'` и не `'Missed Penalty'`.
  - `bundled = true`, если в `detail` непустые и `events`, и `lineups`, и `players`.
  - Если `players` (второй аргумент) равен `null`, берутся `detail.players`.
  - `label` = `"<хозяева> – <гости> <голы>:<голы>"`, например `"Kairat – Astana 2:1"`.
  - `savesGk`: доля вратарей (`games.position === 'G'`, minutes > 0) с `saves !== null`. `cards`: доля игроков, у которых `yellow` и `red` не `null`.

- [ ] **Шаг 5: запустить тесты, убедиться, что проходят.** Команда: `npx vitest run packages/api-football/test`. Ожидается: PASS.

- [ ] **Шаг 6: коммит.** `git add -A && git commit -m "feat(api-football): add KPL lookup and coverage assessment"`

---

### Task 3: зонд и отчёт

**Files:**
- Create: `scripts/probe/probe.ts`, `scripts/probe/report.ts`, `scripts/probe/main.ts`
- Test: `scripts/probe/test/probe.test.ts`, `scripts/probe/test/report.test.ts`

**Interfaces:**
- Consumes: `createApiFootballClient`, `findKpl`, `seasonCoverage`, `assessFixture` (Tasks 1–2).
- Produces:
  - `runProbe(client: ApiFootballClient, opts: { targetSeason: number; maxRequests: number; sampleFixtures: number; wait: () => Promise<void>; onRaw: (name: string, body: unknown) => void }): Promise<ProbeFindings>`
  - `ProbeFindings = { account: { plan: string; requestsToday: number; limitDay: number } | null; league: { id: number; name: string } | null; seasons: SeasonCoverage[]; target: { year: number; accessible: boolean; blockedMessage?: string }; sampleSeason: number | null; fixturesInSeason: number; fixtures: FixtureAssessment[]; live: { checked: boolean; liveNow: number; error?: string }; requestsUsed: number; problems: string[] }`
  - `renderReport(f: ProbeFindings, dateIso: string): string`
  - `parseAllowedSeasons(message: string): { from: number; to: number } | null`

- [ ] **Шаг 1: написать падающие тесты** `probe.test.ts` с поддельным клиентом, который отвечает по заранее заданному сценарию:

```ts
it('сезон открыт: проверяет до N завершённых матчей текущего сезона', ...);
// /status, /leagues?country=Kazakhstan, /fixtures?league&season=2026 → 3 матча FT, 1 NS;
// expect target.accessible true, sampleSeason 2026, fixtures.length 3, live.checked true

it('сезон закрыт тарифом: фиксирует блокировку и берёт последний разрешённый сезон', ...);
// /fixtures season=2026 → errors.plan 'Free plans do not have access to this season, try from 2021 to 2023.'
// expect target { accessible: false, blockedMessage содержит 'Free plans' }, sampleSeason 2023

it('не превышает лимит запросов', ...);  // maxRequests 5 → requestsUsed ≤ 5, в problems есть 'лимит'
it('ждёт между запросами', ...);         // wait вызывается перед каждым запросом, кроме первого
it('ошибка лимита API не роняет зонд', ...); // errors.rateLimit на одном матче → матч пропущен, в problems запись
it('сырые ответы сохраняются без ключа', ...); // onRaw получает тела ответов; JSON.stringify(всех тел) не содержит ключа
```

и `parseAllowedSeasons('…try from 2021 to 2023.')` → `{ from: 2021, to: 2023 }`, `parseAllowedSeasons('other')` → `null`.

- [ ] **Шаг 2: написать падающие тесты** `report.test.ts`:

```ts
it('сезон закрыт: вопрос 1 помечен ❌ и предлагает выход', () => {
  const md = renderReport(blockedFindings, '2026-10-23');
  expect(md).toContain('❌ Бесплатный тариф не даёт сезон 2026');
  expect(md).toContain('Pro');            // вариант: платный тариф
  expect(md).toContain('другой источник');
});
it('рейтинга нет: предлагает отключить бонус', () => {
  expect(renderReport(noRatingFindings, '2026-10-23')).toContain('бонус');
});
it('показатели помечаются по порогам 90% и 30%', ...); // 0.95 → ✅, 0.5 → ⚠️, 0.1 → ❌
it('нет данных об игроках: пишет «нет данных», без NaN', ...);
```

- [ ] **Шаг 3: запустить тесты, убедиться, что падают.** Команда: `npx vitest run scripts/probe/test`. Ожидается: FAIL.

- [ ] **Шаг 4: реализовать** `probe.ts`. Порядок запросов:
  1. `/status`
  2. `/leagues?country=Kazakhstan` → `findKpl`
  3. `/fixtures?league={id}&season={targetSeason}`. При ошибке `plan` выполняется `parseAllowedSeasons`, затем `/fixtures?league={id}&season={to}`
  4. Для последних `sampleFixtures` матчей со статусом `FT`, `AET` или `PEN`, по одному: `/fixtures?id={id}`, затем `/fixtures/players?fixture={id}` → `assessFixture`
  5. `/fixtures?live=all` (считается `liveNow` для матчей лиги `{id}`)

  Перед каждым запросом, кроме первого, вызывается `opts.wait()`. При `requestCount() >= maxRequests` зонд останавливается и пишет в `problems` «достигнут лимит запросов зонда».

- [ ] **Шаг 5: реализовать** `report.ts`. Структура отчёта:
  - заголовок, дата, тариф, использованные запросы;
  - разделы «1. Сезон 2026 на бесплатном тарифе», «2. Какие данные есть», «3. Всё по матчу одним запросом», «4. Что делать дальше»;
  - в разделе 2 таблица: состав, события, минуты, ассисты в событиях голов, ассисты в статистике, сейвы вратарей, пропущенные, карточки, рейтинг. По каждому показателю отметка по порогам из Global Constraints и средняя доля по проверенным матчам.

  Правила для раздела 4:
  - сезон закрыт → варианты: тариф Pro (около 19 $/мес) или другой источник;
  - рейтинг ❌ → бонус отключить (спецификация 4.4);
  - ассисты или сейвы ❌ → вносить вручную в админке;
  - всё ✅ → можно переходить к этапу 1.

- [ ] **Шаг 6: реализовать** `main.ts`. Скрипт:
  - читает `process.env.API_FOOTBALL_KEY`. Если ключа нет, печатает «Нет ключа API_FOOTBALL_KEY: добавьте его в настройках среды и откройте новую сессию» и завершается с кодом 1;
  - вызывает `runProbe` с параметрами: `targetSeason` равен текущему году, `maxRequests: 25`, `sampleFixtures: 3`, `wait` — пауза 7000 мс;
  - пишет сырые ответы в `research/raw/<YYYY-MM-DD>/<NN>-<name>.json` и отчёт в `docs/research/<YYYY-MM-DD>-api-football-kpl.md`;
  - печатает путь к отчёту.

- [ ] **Шаг 7: запустить все тесты.** Команда: `npm test`. Ожидается: PASS, все тесты Tasks 1–3.

- [ ] **Шаг 8: проверить запуск без ключа.** Команда: `env -u API_FOOTBALL_KEY npm run probe; echo "exit=$?"`. Ожидается: сообщение про отсутствие ключа и `exit=1`.

- [ ] **Шаг 9: коммит.** `git add -A && git commit -m "feat(probe): add KPL coverage probe and Russian report"`

---

### Task 4: настоящая проверка и решение

Нужно выполнить Task 0. Тратит до 25 из 100 бесплатных запросов дня.

- [ ] **Шаг 1: убедиться, что доступ есть.** Команда: `curl -sS -o /dev/null -w "%{http_code}\n" https://v3.football.api-sports.io/status`. Ожидается: любой HTTP-код, кроме `000` и `403` (значит, хост доступен). `000` или `403` от прокси означает, что домен не разрешён: вернуться к Task 0, шаг 4.
- [ ] **Шаг 2: запустить зонд.** Команда: `npm run probe`. Ожидается: путь к отчёту. Займёт около 2–3 минут из-за пауз.
- [ ] **Шаг 3: проверить, что ключа нет в файлах.** Команда: `grep -rF "$API_FOOTBALL_KEY" research docs || echo "clean"`. Ожидается: `clean`.
- [ ] **Шаг 4: прочитать отчёт и сверить 2–3 цифры с сырыми ответами** (например, число голов матча и есть ли рейтинг у игроков).
- [ ] **Шаг 5: коммит.** `git add research docs/research && git commit -m "docs: add API-Football KPL coverage report"`
- [ ] **Шаг 6: показать отчёт владельцу.** Если по ответам на вопросы 1–4 нужно менять правила или источник данных, обновить разделы 4.4, 5.4 и 12 спецификации отдельным коммитом после решения владельца.
