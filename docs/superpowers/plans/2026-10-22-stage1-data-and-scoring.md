# Этап 1: база, загрузчик kffleague.kz и подсчёт очков — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать «мозг» игры без экранов. Он состоит из схемы базы, загрузчика матчей ҚПЛ с kffleague.kz, подсчёта очков футболистов и команд и правил состава и трансферов. Итог этапа — репетиция на сезоне 2026: все сыгранные туры загружаются в локальную базу, очки считаются, и пишется отчёт, который владелец проверяет глазами.

**Architecture:** Три пакета с чёткими границами.
- `packages/core` — чистые функции без сети и базы: факты матча → статистика игроков → очки, очки команды за тур, правила состава и трансферов.
- `packages/kffleague` — адаптер источника: вежливый загрузчик страниц, разбор sitemap и страницы матча в `MatchFacts` из `core`.
- `packages/db` — схема PostgreSQL (миграции в формате Supabase) и синхронизация «источник → база».

Код пакетов использует только `fetch` и не импортирует модули Node, чтобы потом работать в Supabase Edge Functions (Deno). Исключения: тесты и `scripts/`.

**Tech Stack:** Node 22, TypeScript (ESM), vitest 2, tsx, PostgreSQL 16 (локально, как в Supabase), npm-пакет `postgres@3.4.7`.

**Spec:** `docs/superpowers/specs/2026-10-22-kpl-fantasy-design.md` (разделы 4, 5.3, 5.4, 6, 8, 9, 10). Факты об источнике: `docs/research/2026-10-22-kffleague-kz.md`.

## Global Constraints

- Источник — только **страницы** kffleague.kz (`/sitemap.xml`, `/ru/matches/<id>`). Пути `/api/` и `/_next/` закрыты в `robots.txt`: **не запрашивать никогда**.
- User-Agent всех запросов: `Mozilla/5.0 (compatible; QPLFantasyBot/0.1; +https://github.com/Konysbayev/qpl-fantasy)`. Без него сайт отвечает 403, в том числе на UA по умолчанию у Node.
- Пауза между запросами к сайту **не меньше 3000 мс**. В репетиции не больше 1000 запросов за запуск.
- Каждый запрос учитывается в `source_usage` (дата, число запросов).
- Время матчей на сайте — Казахстан, UTC+5: `kickoff = "<date>T<time>:00+05:00"`.
- Деньги хранятся целыми в десятых долях миллиона: 100.0 млн = `1000`, 4.5 млн = `45`.
- Правила очков берутся из `seasons.scoring_rules` (JSON формы `ScoringRules`), а не из кода. В коде лежат только значения по умолчанию `DEFAULT_RULES`.
- Сейвов и рейтинга в данных нет: `savesPer3 = null`, `ratingBonus = null` (правило выключено).
- Ручная правка (`manual_override = true`) никогда не перезаписывается загрузчиком.
- Пересчёт очков идемпотентен: повторный запуск даёт те же числа и не создаёт дублей.
- Комментарии в коде — короткие, по-казахски, как в существующем коде. Тексты тестов (`it(...)`) и отчёта — по-русски.

## Review Focus

1. **Автогол и неизвестные типы событий.** Тип автогола на сайте пока не встречался. Неизвестный `event_type` не должен ронять разбор: он попадает в `unknown`, а матч с расхождением «сумма голов в событиях ≠ счёт» помечается `needs_review` и в отчёте. Тесты: Task 2 (разбор) и Task 3 (сверка счёта).
2. **Компенсированное время.** На сайте голы и замены бывают на 92-й или 93-й минуте. Минуты игрока не больше 90, а вышедший на 93-й минуте получает 1 минуту, то есть очко за выход. Тест в Task 3.
3. **Вторая жёлтая.** Игрок получает только −3 за удаление, а не −1 −3. Тест в Task 3.
4. **Страница без данных.** Сайт может отдать 403, HTML без встроенных данных или будущий матч без составов. Будет понятная ошибка или пустая статистика, синхронизация продолжает остальные матчи, проблема пишется в отчёт. Тесты в Task 2 и Task 8.
5. **Повторная синхронизация.** Повторный запуск по тем же матчам не дублирует строки, не трогает `manual_override` и обновляет перенесённый матч: дата и тур берутся новые. Тест в Task 8.

## Структура файлов

```
qpl-fantasy/
├── supabase/migrations/0001_init.sql      # схема из раздела 6 + RLS (раздел 8)
├── packages/core/src/
│   ├── types.ts          # Position, MatchFacts, MatchEvent, PlayerMatchStat
│   ├── rules.ts          # ScoringRules, DEFAULT_RULES
│   ├── match-stats.ts    # buildPlayerMatchStats(): минуты, голы, карточки, пропущенные
│   ├── scoring.ts        # scorePlayer(): очки футболиста за матч с расшифровкой
│   ├── team-score.ts     # scoreGameweekTeam(): автозамены, капитан, сумма за тур
│   └── squad.ts          # правила состава, схемы, трансферов, Wildcard, цен
├── packages/kffleague/src/
│   ├── flight.ts         # извлечение встроенных данных Next.js и чтение JSON по ключу
│   ├── match.ts          # parseMatchPage(): страница матча → MatchFacts
│   ├── sitemap.ts        # parseSitemapMatches(): id и даты матчей
│   └── fetcher.ts        # createPoliteFetcher(): UA, пауза, счётчик, ошибки
├── packages/kffleague/test/fixtures/      # настоящие страницы, сжатые .gz
├── packages/db/src/
│   ├── migrate.ts        # applyMigrations(): применение supabase/migrations/*.sql
│   └── sync.ts           # upsertMatch(), syncSeason()
├── scripts/rehearsal/
│   ├── main.ts           # запуск репетиции 2026
│   └── report.ts         # renderRehearsalReport(): отчёт на русском
└── docs/research/<дата>-rehearsal-2026.md # отчёт репетиции (коммитится)
```

Каждый пакет держит тесты рядом: `packages/<пакет>/test/*.test.ts`. В `vitest.config.ts` уже стоит шаблон `packages/**/test/**/*.test.ts`.

---

### Task 1: типы ядра, правила очков и статистика игрока за матч

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/rules.ts`, `packages/core/src/match-stats.ts`
- Test: `packages/core/test/match-stats.test.ts`

**Interfaces:**
- Produces:
```ts
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export interface TeamRef { sourceId: number; name: string; nameKz: string | null; logoUrl: string | null }
export interface LineupPlayer {
  sourceId: number; firstName: string; lastName: string; number: number | null;
  position: Position | null; teamSourceId: number; starter: boolean; isCaptain: boolean;
}
export type MatchEvent =
  | { kind: 'goal' | 'penalty_goal' | 'own_goal'; minute: number; teamSourceId: number; playerSourceId: number; assistSourceId: number | null }
  | { kind: 'yellow' | 'second_yellow' | 'red'; minute: number; teamSourceId: number; playerSourceId: number }
  | { kind: 'sub'; minute: number; teamSourceId: number; outSourceId: number; inSourceId: number }
  | { kind: 'unknown'; minute: number | null; rawType: string };
export type MatchStatus = 'upcoming' | 'live' | 'finished' | 'other';
export interface MatchFacts {
  sourceId: number; seasonSourceId: number; tour: number | null; kickoff: string; status: MatchStatus;
  home: TeamRef; away: TeamRef; homeScore: number | null; awayScore: number | null;
  lineups: LineupPlayer[];   // пусто, если составов ещё нет
  events: MatchEvent[];
}
export interface PlayerMatchStat {
  playerSourceId: number; teamSourceId: number; position: Position | null;
  minutes: number; onMinute: number | null; offMinute: number | null;
  goals: number; assists: number; penaltyGoals: number; ownGoals: number;
  yellow: number; red: number; conceded: number;
  penaltiesSaved: number; penaltiesMissed: number;   // данных пока нет → 0
}
export interface MatchStatsResult { stats: PlayerMatchStat[]; needsReview: string[] }
export function buildPlayerMatchStats(m: MatchFacts): MatchStatsResult;
```
- `rules.ts`:
```ts
type ByPos = Record<Position, number>;
export interface ScoringRules {
  appearance: { under60: number; from60: number };
  goal: ByPos; assist: number; cleanSheet: ByPos; cleanSheetMinMinutes: number;
  concededPer2: ByPos; penaltySaved: number; penaltyMissed: number;
  yellow: number; red: number; ownGoal: number;
  savesPer3: number | null; ratingBonus: [number, number, number] | null;
}
export const DEFAULT_RULES: ScoringRules; // значения из спецификации 4.4:
// appearance 1/2; goal GK 6, DEF 6, MID 5, FWD 4; assist 3;
// cleanSheet GK 4, DEF 4, MID 1, FWD 0; cleanSheetMinMinutes 60;
// concededPer2 GK -1, DEF -1, MID 0, FWD 0; penaltySaved 5; penaltyMissed -2;
// yellow -1; red -3; ownGoal -2; savesPer3 null; ratingBonus null
```

Правила расчёта в `buildPlayerMatchStats`:
- Выход: игрок основы выходит на 0-й минуте. Запасной считается вышедшим, только если он `inSourceId` в событии `sub`, и выходит на минуте замены.
- Уход: минута `sub` (как `outSourceId`), `red` или `second_yellow`. Без них `offMinute = null` (до конца матча).
- `minutes = min(off ?? 90, 90) − min(on, 90)`; если игрок вышел на поле и результат < 1, то `minutes = 1`. Кто не выходил: `minutes = 0`, `onMinute = null`.
- Пропущенные: гол соперника (`goal`, `penalty_goal`) или автогол своей команды (`own_goal` с `teamSourceId` игрока, который забил в свои ворота) засчитывается игроку, если `on ≤ минута < off`; при `off = null` верхней границы нет.
- `second_yellow` → `red = 1, yellow = 0` (первая жёлтая не считается); прямая `red` → `red = 1`.
- `penalty_goal` считается и в `goals`, и в `penaltyGoals`. Ассист идёт игроку из `assistSourceId`.
- `needsReview` получает текст, если: (а) сумма голов по событиям не совпадает с `homeScore`/`awayScore` при `status = 'finished'`; (б) есть события `unknown`; (в) у игрока основы `position = null`.

- [ ] **Step 1: Написать падающие тесты** в `packages/core/test/match-stats.test.ts` на маленьких фактах, собранных функцией-помощником `facts({...})` внутри теста. Матч 2:1, хозяева id 1, гости id 2:
  - `it('игрок основы без замен играет 90 минут')` → `minutes === 90, onMinute === 0, offMinute === null`;
  - `it('замена на 60-й: ушедший 60 минут, вышедший 30')` → 60 и 30;
  - `it('вышедший на 93-й минуте получает 1 минуту')` → `minutes === 1`;
  - `it('гол на 92-й минуте засчитывается как пропущенный тем, кто на поле')` → `conceded` у вратаря гостей включает этот гол;
  - `it('ушедший на 60-й не получает гол, пропущенный на 60-й')` → у ушедшего `conceded === 0`, у вышедшего `1`;
  - `it('вторая жёлтая: red 1, yellow 0, уход с поля на этой минуте')`;
  - `it('пенальти считается голом и пенальти')` → `goals === 1, penaltyGoals === 1`;
  - `it('ассист достаётся ассистенту')` → `assists === 1`;
  - `it('счёт не сходится с событиями → needsReview')` → `needsReview.length === 1`;
  - `it('неизвестное событие → needsReview, разбор не падает')`;
  - `it('запасной, который не вышел, — 0 минут и не попадает в пропущенные')`.
- [ ] **Step 2: Запустить** `npx vitest run packages/core/test/match-stats.test.ts` → FAIL (модуля нет).
- [ ] **Step 3: Реализовать** `types.ts`, `rules.ts` (`DEFAULT_RULES` со значениями выше) и `buildPlayerMatchStats` в `match-stats.ts`.
- [ ] **Step 4: Запустить** `npx vitest run packages/core` → PASS, затем `npx tsc` → без ошибок.
- [ ] **Step 5: Commit** `git add packages/core && git commit -m "feat(core): match facts types and per-player match stats"`

### Task 2: разбор страницы матча kffleague.kz

**Files:**
- Create: `packages/kffleague/src/flight.ts`, `packages/kffleague/src/match.ts`
- Create: `packages/kffleague/test/fixtures/match-993.html.gz`, `match-1109.html.gz`, `match-896.html.gz`
- Test: `packages/kffleague/test/match.test.ts`

**Interfaces:**
- Consumes: `MatchFacts`, `MatchEvent`, `LineupPlayer`, `Position` из `packages/core/src/types.ts`.
- Produces:
```ts
export class ParseError extends Error {}
export function extractFlightText(html: string): string;           // ParseError, если данных нет
export function readJsonAt(text: string, start: number): unknown;  // сбалансированный JSON-объект/массив с позиции start
export function parseMatchPage(html: string, matchId: number): MatchFacts;
```

Факты о странице (проверены на настоящих страницах):
- Данные лежат в `<script>self.__next_f.push([1,"<строка JSON>"])</script>`. Строки по очереди декодируются как JSON-строки и склеиваются.
- Объект матча — `{"id":<matchId>,"date":"YYYY-MM-DD","time":"HH:MM","tour":N,"season_id":S,...}`. На странице есть и другие матчи (виджеты), поэтому брать объект с `id === matchId` и ключами `date` и `season_id`. Поля: `status` (`upcoming|live|finished|…`), `home_team`/`away_team` (`id`, `name`, `name_kz`, `logo_url`), `home_score`, `away_score`.
- Составы: `"lineups":{"home_team":{"team_id","starters":[...],"substitutes":[...]},"away_team":{...}}`. Игрок: `player_id`, `first_name`, `last_name`, `number`, `position` (`GK|DEF|MID|FWD`), `is_captain`. У будущего матча `has_lineup:false` и пустые массивы.
- События: `"events":[{event_type, minute, team_id, player_id, assist_player_id, player2_id}]`. Типы: `goal`, `penalty` (забитый пенальти), `yellow_card`, `second_yellow`, `red_card`, `own_goal`, `substitution`. Для `substitution` в `player_id` тот, кто ушёл, в `player2_id` тот, кто вышел. Строка `"$undefined"` означает `null`. Остальные типы → `{kind:'unknown'}`.
- Объект события может встречаться на странице дважды: дубликаты убираются по полю `id` события.

- [ ] **Step 1: Скачать фикстуры** (один раз, с паузой):
```bash
UA='Mozilla/5.0 (compatible; QPLFantasyBot/0.1; +https://github.com/Konysbayev/qpl-fantasy)'
mkdir -p packages/kffleague/test/fixtures && cd packages/kffleague/test/fixtures
for id in 993 1109 896; do curl -sS -A "$UA" "https://kffleague.kz/ru/matches/$id" | gzip -9 > match-$id.html.gz; sleep 3; done
```
Проверить: каждый файл > 50 КБ.
- [ ] **Step 2: Написать падающие тесты** (фикстуры читаются через `zlib.gunzipSync`):
  - `it('матч 993: Кызылжар 2:4 Кайрат, тур 14, сезон 200, finished')` → `home.sourceId === 87, away.sourceId === 13, homeScore === 2, awayScore === 4, tour === 14, seasonSourceId === 200, kickoff === '2026-06-21T18:00:00+05:00'`;
  - `it('матч 993: составы 11+11 в основе, вратарь Челядник')` → 22 игрока со `starter === true`; игрок `445` с `position === 'GK'` и `teamSourceId === 87`;
  - `it('матч 993: гол Оксанена с ассистом Юкколы на 9-й')` → событие `{kind:'goal', minute:9, playerSourceId:2560, assistSourceId:2562, teamSourceId:13}`;
  - `it('матч 993: замена на 33-й — ушёл 2560, вышел 1872')`;
  - `it('матч 993: 4 гола с игры и 2 пенальти, без дубликатов')`;
  - `it('матч 1109 (будущий): upcoming, составов и событий нет')`;
  - `it('матч 896: 0:0, событий голов нет')`;
  - `it('HTML без встроенных данных → ParseError')` на строке `'<html>403 Forbidden</html>'`;
  - `it('неизвестный event_type → unknown')` на маленьком синтетическом HTML с одним `push`.
- [ ] **Step 3: Запустить** `npx vitest run packages/kffleague` → FAIL.
- [ ] **Step 4: Реализовать** `flight.ts` и `parseMatchPage`. `readJsonAt` идёт по символам с учётом строк и экранирования, ищет парную скобку и вызывает `JSON.parse` на вырезанном куске.
- [ ] **Step 5: Запустить** `npx vitest run packages/kffleague` → PASS; `npx tsc` → без ошибок.
- [ ] **Step 6: Commit** `git add packages/kffleague && git commit -m "feat(kffleague): parse match pages into MatchFacts"`

### Task 3: очки футболиста за матч

**Files:**
- Create: `packages/core/src/scoring.ts`
- Test: `packages/core/test/scoring.test.ts`

**Interfaces:**
- Consumes: `PlayerMatchStat`, `ScoringRules`, `DEFAULT_RULES`.
- Produces:
```ts
export interface PointsLine { code: 'appearance'|'goal'|'assist'|'clean_sheet'|'conceded'|'penalty_saved'|'penalty_missed'|'yellow'|'red'|'own_goal'; points: number }
export interface PlayerPoints { total: number; lines: PointsLine[] }
export function scorePlayer(stat: PlayerMatchStat, position: Position, rules: ScoringRules): PlayerPoints;
```
Нулевые строки в `lines` не попадают. Кто не выходил (`minutes = 0`), получает `total = 0` и пустой `lines`.

- [ ] **Step 1: Написать падающие тесты** — по одному на строку таблицы 4.4 с `DEFAULT_RULES`:
  - `it('1–59 минут = 1, 60+ = 2')`;
  - `it('гол вратаря/защитника 6, полузащитника 5, нападающего 4')`;
  - `it('ассист 3')`;
  - `it('сухой матч: защитник 60+ минут = 4, полузащитник = 1, нападающий = 0')`;
  - `it('сухой матч не даётся при 59 минутах')`;
  - `it('каждые 2 пропущенных у вратаря и защитника −1 (3 пропущенных = −1, 4 = −2)')`;
  - `it('жёлтая −1, удаление −3, автогол −2')`;
  - `it('вторая жёлтая = только −3')` — стат `red:1, yellow:0` из Task 1 даёт `−3`, проверка вместе с `buildPlayerMatchStats` на событиях `yellow` + `second_yellow`;
  - `it('не выходил — 0 очков')`;
  - `it('правила из настроек сезона: гол нападающего 5 вместо 4')` — проверка, что значения берутся из `rules`.
- [ ] **Step 2: Запустить** `npx vitest run packages/core/test/scoring.test.ts` → FAIL.
- [ ] **Step 3: Реализовать** `scorePlayer`.
- [ ] **Step 4: Запустить** `npx vitest run packages/core` → PASS.
- [ ] **Step 5: Commit** `git add packages/core && git commit -m "feat(core): player scoring from season rules"`

### Task 4: очки команды за тур

**Files:**
- Create: `packages/core/src/team-score.ts`
- Test: `packages/core/test/team-score.test.ts`

**Interfaces:**
- Consumes: `Position`.
- Produces:
```ts
export interface Pick { playerId: string; slot: number; isCaptain: boolean; isVice: boolean } // slot 1–11 основа, 12–15 запас по порядку
export interface PlayerGameweek { position: Position; points: number; played: boolean }      // сумма за все матчи тура (двойной тур)
export interface TeamGameweekScore { total: number; finalXI: string[]; subsIn: string[]; captainId: string | null }
export function isValidFormation(positions: Position[]): boolean; // 11 игроков: 1 GK, ≥3 DEF, ≥1 FWD
export function scoreGameweekTeam(picks: Pick[], players: Map<string, PlayerGameweek>): TeamGameweekScore;
```
Автозамены: игроки основы с `played = false` идут по порядку слотов. Каждого меняет первый по порядку запасной с `played = true`, если схема остаётся допустимой. Вратаря меняет только вратарь, полевого — только полевой. Капитан получает ×2, если `played`; иначе ×2 получает вице, если `played`; иначе удвоения нет. Штраф за трансферы сюда не входит.

- [ ] **Step 1: Написать падающие тесты:**
  - `it('сумма очков основы, капитан ×2')`;
  - `it('капитан не сыграл → ×2 у вице')`;
  - `it('оба не сыграли → без удвоения')`;
  - `it('автозамена: первый сыгравший запасной входит')`;
  - `it('автозамена пропускает запасного, если ломается схема (остаётся 2 защитника)')`;
  - `it('вратаря меняет только запасной вратарь')`;
  - `it('двойной тур: очки игрока за два матча уже суммированы и удваиваются у капитана')`.
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать.** **Step 4: Запустить** `npx vitest run packages/core` → PASS.
- [ ] **Step 5: Commit** `feat(core): gameweek team score with autosubs and captaincy`.

### Task 5: правила состава, трансферов, Wildcard и цен

**Files:**
- Create: `packages/core/src/squad.ts`
- Test: `packages/core/test/squad.test.ts`

**Interfaces:**
- Consumes: `Position`.
- Produces:
```ts
export interface SquadPlayer { id: string; position: Position; clubId: string; price: number } // price в десятых: 45 = 4.5 млн
export type SquadError = 'size' | 'positions' | 'club_limit' | 'budget';
export const SQUAD_RULES = { size: 15, positions: { GK: 2, DEF: 5, MID: 5, FWD: 3 }, maxPerClub: 3, budget: 1000 } as const;
export function validateSquad(players: SquadPlayer[], budget?: number): SquadError[];
export interface TransferState { freeTransfers: number; unlimited: boolean; wildcard: boolean }
export function transferPenalty(made: number, s: TransferState): { penalty: number; freeLeft: number }; // −4 за каждый сверх бесплатных
export function nextFreeTransfers(freeLeft: number): number;             // min(freeLeft + 1, 5)
export function canUseWildcard(tour: number, usedOnTours: number[]): boolean; // один на туры 1–15, один на 16–30
export interface PriceThresholds { steps: [number, number][] }           // [[0.05, 1], [0.10, 2], [0.20, 3]]
export function priceDelta(netTransfersIn: number, totalManagers: number, t: PriceThresholds): number; // в десятых, со знаком
export function clampPrice(price: number): number;                       // 35..120
```

- [ ] **Step 1: Написать падающие тесты:**
  - `validateSquad`: правильный состав → `[]`; 16 игроков → `['size']`; 3 вратаря → `['positions']`; 4 из одного клуба → `['club_limit']`; сумма 1001 → `['budget']`;
  - `transferPenalty`: 1 при 1 бесплатном → `0`; 3 при 1 бесплатном → `−8`; при `unlimited` или `wildcard` → `0`; `freeLeft` не уходит ниже 0;
  - `nextFreeTransfers(4) === 5`, `nextFreeTransfers(5) === 5`;
  - `canUseWildcard(10, []) === true`, `canUseWildcard(12, [3]) === false`, `canUseWildcard(20, [3]) === true`, `canUseWildcard(25, [3, 18]) === false`;
  - `priceDelta`: 5% чистых покупок → `+1`, 12% → `+2`, 25% → `+3`, −7% → `−1`, 3% → `0`; `totalManagers = 0` → `0`;
  - `clampPrice(121) === 120`, `clampPrice(30) === 35`.
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать.** **Step 4: Запустить** → PASS.
- [ ] **Step 5: Commit** `feat(core): squad, transfer, wildcard and price rules`.

### Task 6: схема базы

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `packages/db/src/migrate.ts`
- Create: `packages/db/test/helpers.ts` (подключение к тестовой базе), `packages/db/test/schema.test.ts`
- Modify: `package.json` (зависимость `postgres@3.4.7`, скрипт `"db:test-setup"`)

**Interfaces:**
- Produces:
```ts
export async function applyMigrations(sql: postgres.Sql, dir: string): Promise<string[]>; // применённые файлы; учёт в таблице schema_migrations
// helpers.ts
export async function freshDb(): Promise<postgres.Sql>; // пересоздаёт базу qpl_test, ставит заглушку auth (см. ниже), применяет миграции
```

Таблицы по разделу 6 спецификации. Внутренние ключи `id uuid primary key default gen_random_uuid()`, номера с сайта хранятся в `source_id`. Уточнения:
- `seasons(id, year, source_season_id int unique, scoring_rules jsonb not null, status)`.
- `clubs(id, source_id int unique, name_ru, name_kz, code, logo_url, kit jsonb)`.
- `players(id, source_id int unique, first_name, last_name, club_id, position check in ('GK','DEF','MID','FWD'), price int, status, needs_review bool default false)`.
- `gameweeks(id, season_id, number, deadline timestamptz, status, unique(season_id, number))`.
- `fixtures(id, source_id int unique, season_id, gameweek_id null, home_club_id, away_club_id, kickoff timestamptz, status, home_score, away_score, needs_review text[] default '{}')`.
- `player_match_stats(fixture_id, player_id, minutes, on_minute, off_minute, goals, assists, penalty_goals, own_goals, yellow, red, conceded, penalties_saved, penalties_missed, points int, points_lines jsonb, manual_override bool default false, primary key(fixture_id, player_id))`.
- `source_raw(id, fixture_source_id, fetched_at, body text)`, `source_usage(day date primary key, requests int)`, `source_skip(source_id int primary key, reason text)` — номера страниц из sitemap, которые не относятся к нашему сезону.
- `users(id, telegram_id bigint unique, auth_id uuid unique, display_name, lang, notify jsonb, role check in ('player','admin'))`, `squads`, `squad_picks`, `transfers`, `leagues`, `league_members`, `gameweek_scores`, `audit_log` — по разделу 6.

RLS (раздел 8): включён на всех таблицах. `anon` и `authenticated` читают `seasons, clubs, players, gameweeks, fixtures, player_match_stats, leagues`. Свои `squads/squad_picks/transfers` пользователь читает всегда, чужие — только после дедлайна тура (`gameweeks.deadline < now()`). Прямой записи для `anon/authenticated` нет нигде. Для локальных тестов `freshDb()` создаёт роли `anon`, `authenticated` и функцию `auth.uid()` (возвращает `current_setting('request.jwt.claim.sub', true)::uuid`), как в Supabase.

- [ ] **Step 1: Подготовить локальный PostgreSQL** (один раз в среде): `service postgresql start` и `su postgres -c "psql -c \"alter user postgres password 'postgres'\""`. Адрес по умолчанию для тестов: `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres`. Добавить в `package.json` скрипт `"db:test-setup"` с этими командами.
- [ ] **Step 2: Написать падающие тесты** `schema.test.ts`:
  - `it('миграции применяются на чистую базу и повторно ничего не делают')` → второй `applyMigrations` возвращает `[]`;
  - `it('позиция игрока вне GK/DEF/MID/FWD отклоняется')`;
  - `it('anon читает игроков, но не может их изменить')`;
  - `it('пользователь видит свой состав, а чужой — только после дедлайна')` — два пользователя, тур с дедлайном в будущем, потом `update gameweeks set deadline = now() - interval '1 minute'`; запросы выполняются под `set local role authenticated` и `set local request.jwt.claim.sub = '<auth_id>'`.
- [ ] **Step 3: Запустить** `npx vitest run packages/db` → FAIL.
- [ ] **Step 4: Написать** `0001_init.sql` и `applyMigrations` (каждый файл применяется в одной транзакции, имя пишется в `schema_migrations`).
- [ ] **Step 5: Запустить** `npx vitest run packages/db` → PASS.
- [ ] **Step 6: Commit** `feat(db): initial schema with RLS and migration runner`.

### Task 7: вежливый загрузчик и sitemap

**Files:**
- Create: `packages/kffleague/src/fetcher.ts`, `packages/kffleague/src/sitemap.ts`
- Test: `packages/kffleague/test/fetcher.test.ts`, `packages/kffleague/test/sitemap.test.ts`

**Interfaces:**
- Produces:
```ts
export const USER_AGENT = 'Mozilla/5.0 (compatible; QPLFantasyBot/0.1; +https://github.com/Konysbayev/qpl-fantasy)';
export const BASE_URL = 'https://kffleague.kz';
export interface PoliteFetcher { get(path: string): Promise<{ status: number; body: string }>; requestCount(): number }
export function createPoliteFetcher(opts: {
  minIntervalMs?: number;             // по умолчанию 3000
  maxRequests?: number;               // по умолчанию Infinity
  fetchImpl?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>;
  onRequest?: () => void | Promise<void>;   // для учёта в source_usage
}): PoliteFetcher;
export class ForbiddenPathError extends Error {}   // путь начинается с /api/ или /_next/
export class RequestLimitError extends Error {}
export interface SitemapMatch { id: number; date: string }  // date из <lastmod>, YYYY-MM-DD
export function parseSitemapMatches(xml: string): SitemapMatch[]; // только /matches/<id>, без дублей языков
```

- [ ] **Step 1: Написать падающие тесты:**
  - `it('шлёт наш User-Agent')`;
  - `it('держит паузу не меньше 3000 мс между запросами')` — поддельные `now`/`sleep`, проверка суммы пауз;
  - `it('отказывается от /api/ и /_next/ без запроса в сеть')` → `ForbiddenPathError`, `fetchImpl` не вызван;
  - `it('после maxRequests бросает RequestLimitError')`;
  - `it('сетевая ошибка → status 0 и текст ошибки, а не падение')`;
  - `it('sitemap: матчи и даты, без дублей и без новостей')` — на маленьком XML из трёх `<url>`: `/matches/993` с `<lastmod>2026-06-21T…`, `/ru/matches/993` и `/news/5`.
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать.** **Step 4: Запустить** → PASS.
- [ ] **Step 5: Commit** `feat(kffleague): polite fetcher and sitemap parser`.

### Task 8: синхронизация «источник → база»

**Files:**
- Create: `packages/db/src/sync.ts`
- Test: `packages/db/test/sync.test.ts`

**Interfaces:**
- Consumes: `parseMatchPage`, `parseSitemapMatches`, `PoliteFetcher` (Task 2, 7); `buildPlayerMatchStats`, `scorePlayer`, `ScoringRules` (Task 1, 3); схема (Task 6).
- Produces:
```ts
export interface SyncReport { stored: number[]; skipped: number[]; failed: { id: number; error: string }[]; needsReview: { id: number; reasons: string[] }[] }
export async function upsertMatch(sql: postgres.Sql, seasonId: string, facts: MatchFacts, rawHtml: string): Promise<{ needsReview: string[] }>;
export async function syncSeason(sql: postgres.Sql, fetcher: PoliteFetcher, opts: { seasonId: string; sourceSeasonId: number; year: number; refetchFinished?: boolean }): Promise<SyncReport>;
```

`upsertMatch` в одной транзакции:
1. Клубы по `source_id`: создаются или обновляются названия и логотип.
2. Игроки по `source_id`: новый создаётся с позицией из состава, `price = 45` и `needs_review = true`; у существующего обновляется клуб, позиция не меняется.
3. Тур `gameweeks(season_id, number = tour)` создаётся, если его нет. Его `deadline` пересчитывается как самый ранний `kickoff` матчей тура минус 1 час (спецификация 4.2).
4. Матч по `source_id` обновляется: дата, тур, статус, счёт, `needs_review`.
5. В `source_raw` добавляется сырой HTML.
6. `player_match_stats` для этого матча: строки с `manual_override = false` заменяются, строки с `manual_override = true` не трогаются; очки и расшифровка считаются по `seasons.scoring_rules`.

`syncSeason`: берёт `/sitemap.xml` и номера матчей с датой из года `year`. Пропускает номера из `source_skip`, а также уже сохранённые матчи со статусом `finished`, если не задан `refetchFinished`. Загружает страницу: при `seasonSourceId ≠ sourceSeasonId` записывает номер в `source_skip`, иначе вызывает `upsertMatch`. Ошибка одного матча пишется в `failed`, обход продолжается. Каждый запрос учитывается в `source_usage`.

- [ ] **Step 1: Написать падающие тесты** (на базе из `freshDb()` и фикстурах из Task 2; загрузчик поддельный, без сети):
  - `it('матч 993 сохраняется: 2 клуба, игроки, тур 14, очки у Оксанена (гол + ассист соперника не его)')` — сверка `points` игрока 2560 с `scorePlayer` на его статистике;
  - `it('повторный upsert того же матча не создаёт дублей')`;
  - `it('manual_override не перезаписывается')`;
  - `it('перенесённый матч: новая дата и тур обновляются')` — второй upsert с изменёнными `kickoff` и `tour`;
  - `it('syncSeason: чужой сезон → source_skip, сломанная страница → failed, остальные сохраняются')`;
  - `it('будущий матч 1109 сохраняется без статистики игроков')`;
  - `it('дедлайн тура = первый матч тура минус 1 час и сдвигается, если матч перенесли раньше')`.
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать.** **Step 4: Запустить** `npx vitest run` → PASS (весь набор).
- [ ] **Step 5: Commit** `feat(db): sync kffleague matches into the database`.

### Task 9: репетиция на сезоне 2026 и отчёт

**Files:**
- Create: `scripts/rehearsal/main.ts`, `scripts/rehearsal/report.ts`
- Test: `scripts/rehearsal/test/report.test.ts`
- Modify: `package.json` (скрипт `"rehearsal": "NODE_USE_ENV_PROXY=1 tsx scripts/rehearsal/main.ts"`)
- Result: `docs/research/<дата>-rehearsal-2026.md`

**Interfaces:**
- Consumes: всё выше.
- Produces:
```ts
export interface RehearsalData {
  date: string; requests: number; sync: SyncReport;
  tours: { number: number; matches: number; top: { name: string; club: string; position: Position; points: number }[] }[];
  seasonTop: { name: string; club: string; position: Position; points: number; goals: number; assists: number; minutes: number }[];
  samples: { name: string; match: string; lines: PointsLine[]; total: number }[];  // 3 игрока для ручной сверки
}
export function renderRehearsalReport(d: RehearsalData): string;
```

`main.ts`: база `DATABASE_URL`, по умолчанию `postgres://postgres:postgres@localhost:5432/qpl_rehearsal`. Скрипт применяет миграции, создаёт сезон 2026 (`source_season_id = 200`, `scoring_rules = DEFAULT_RULES`), вызывает `syncSeason` с `maxRequests = 1000` и паузой 3000 мс, собирает `RehearsalData` SQL-запросами и пишет отчёт. Повторный запуск дозагружает только новое: матчи из `source_skip` и уже сыгранные не загружаются заново.

Отчёт (по-русски):
1. Сводка: запросов, матчей сохранено, пропущено, ошибок.
2. Матчи «на проверку» с причинами.
3. Топ-20 сезона: очки, голы, ассисты, минуты.
4. Лучшие 5 игроков каждого тура.
5. Три расшифровки очков для ручной сверки: лучший нападающий, лучший защитник и вратарь с наибольшим числом сухих матчей.

- [ ] **Step 1: Написать падающие тесты** `report.test.ts` на маленьком `RehearsalData`: в отчёте есть заголовки пяти разделов; матч на проверку выводится с причиной; при пустом `needsReview` выводится «Матчей на проверку нет»; расшифровка выводит строки `goal`, `assist` по-русски («Гол», «Ассист», «Выход», «Сухой матч», «Пропущенные», «Жёлтая», «Удаление», «Автогол»).
- [ ] **Step 2: Запустить** → FAIL. **Step 3: Реализовать** `report.ts` и `main.ts`. **Step 4: Запустить** `npx vitest run` → PASS; `npx tsc` → без ошибок.
- [ ] **Step 5: Запустить репетицию** `npm run rehearsal` (около 40–50 минут: ~860 страниц 2026 года по 3 секунды). Ожидание: сохранено ~230 матчей ҚПЛ (туры 1–28), `failed` пуст или объяснён в отчёте.
- [ ] **Step 6: Сверить вручную** три расшифровки из отчёта со страницами матчей на kffleague.kz. Если есть расхождения, исправить их через TDD в задаче, которой принадлежит код.
- [ ] **Step 7: Commit** `git add scripts/rehearsal docs/research package.json && git commit -m "feat: 2026 season rehearsal report"` и `git push`.

---

## Что получит владелец после этапа 1

Отчёт `docs/research/<дата>-rehearsal-2026.md`: кто сколько набрал бы очков в каждом туре ҚПЛ-2026 по нашим правилам. Его можно сверить со своим знанием сезона: «Томасов в 14-м туре забил два — у него 10 очков, верно».
