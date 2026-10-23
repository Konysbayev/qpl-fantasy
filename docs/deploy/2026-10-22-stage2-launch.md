# Этап 2: запуск Mini App — пошагово

Код этапа 2 готов и проверен локально (тесты, скриншоты, функции в настоящем Deno на данных сезона 2026). Чтобы бот заработал в Telegram, нужны три вещи, которые делает владелец, и одна команда, которую запускает Claude.

## 1. Что нужно от владельца

### 1.1 Токен Supabase с правом записи

Сейчас в сетевых секретах окружения лежит токен, с которым база доступна **только на чтение** (запросы выполняются от `supabase_read_only_user`). С ним нельзя создать таблицы, загрузить данные и выложить функции.

1. supabase.com → аватар → **Account → Access Tokens → Generate new token** (обычный токен, без ограничения «только чтение»).
2. Заменить им значение сетевого секрета для `api.supabase.com` (Authorization: Bearer …) в настройках окружения Claude.
3. **В чат токен не вставлять.**
4. Написать Claude: «можно выкладывать в Supabase». Это изменит облачный проект, поэтому нужно явное разрешение.

### 1.2 Токен бота

1. В Telegram у @BotFather: `/newbot`, имя «QPL Fantasy», логин вроде `qplfantasy_bot`; аватар — `brand/qpl-telegram-avatar-640.png`.
2. Токен бота добавить в настройки окружения Claude как переменную **`TELEGRAM_BOT_TOKEN`**. В чат не вставлять.

### 1.3 Cloudflare Pages

cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git** → репозиторий `qpl-fantasy`.

| Настройка | Значение |
|---|---|
| Production branch | `main` (после слияния этапа 2) |
| Framework preset | None |
| Build command | `npm ci && npm run web:build` |
| Build output directory | `apps/web/dist` |
| Root directory | пусто (корень репозитория) |
| Переменная `NODE_VERSION` | `22` |
| Переменная `VITE_SUPABASE_URL` | `https://gckotzbfqduksfjxtqwf.supabase.co` |
| Переменная `VITE_SUPABASE_FUNCTION_REGION` (необязательно) | регион базы; по умолчанию `ap-northeast-2` (Сеул). Функции запускаются рядом с базой, иначе каждый ответ идёт 2–7 секунд |
| Переменная `VITE_SUPABASE_ANON_KEY` | публичный ключ: Supabase → Project Settings → API Keys → `anon` / `publishable` |

Публичный ключ можно показывать: он и так встроен в приложение, а доступ к данным ограничен правилами базы. Ключ `service_role` / `secret` **не** использовать.

После первой сборки Cloudflare покажет адрес вида `https://qpl-fantasy.pages.dev`.

### 1.4 Кнопка «Ойнау» в боте

У @BotFather: `/setmenubutton` → выбрать бота → адрес Pages из шага 1.3 → текст кнопки **Ойнау**.

## 2. Что делает Claude (после 1.1 и 1.2)

Команды из корня репозитория, `SUPABASE_PROJECT_REF=gckotzbfqduksfjxtqwf`:

```bash
npm run deploy:migrate        # таблицы и правила доступа: миграции 0001–0006
npm run deploy:seed           # сезон 2026: 16 клубов, 519 игроков с ценами, 30 туров, 240 матчей, статистика
npm run deploy:functions -- health auth-telegram team-view squad-save transfer-commit
npm run deploy:secrets        # TELEGRAM_BOT_TOKEN из окружения и новый SESSION_SECRET
```

Проверка: `curl https://gckotzbfqduksfjxtqwf.supabase.co/functions/v1/health` → `{"ok":true,"time":…,"db":true,"secrets":{"TELEGRAM_BOT_TOKEN":true,"SESSION_SECRET":true}}`. Если что-то не так — `"ok":false` и код 503.

Бэкап: `npm run deploy:backup` → `backups/<дата>/` (каждая таблица — JSON). Раз в неделю его делает GitHub Actions, если в настройках репозитория (Settings → Secrets and variables → Actions) добавлен секрет `SUPABASE_ACCESS_TOKEN`; хватает токена с правом чтения.

`deploy:seed` берёт данные из локальной базы репетиции (`npm run rehearsal` пересобирает её с kffleague.kz) и пишет отчёт с ценами `docs/research/<дата>-prices-draft.md`.

**Важно знать:**
- В облаке пока **нет автоматической загрузки матчей** (это этап 3). Чтобы появились очки сыгранного тура (например, 29-го после 24–25 октября), Claude заново запускает `npm run rehearsal` и `npm run deploy:seed`.
- Повторный `deploy:seed` **перезаписывает цены** черновыми (по формуле), а также туры и матчи. Составы, трансферы и ручные правки статистики (`manual_override`) он не трогает.

## 3. Проверка владельцем на телефоне

- Открыть бота → «Ойнау» → вход без паролей.
- Собрать первый состав (100.0 млн, 2/5/5/3, не больше 3 из клуба), сохранить.
- Поменять капитана в карточке игрока, сделать замену «Ауыстыру».
- Сделать трансфер: первый — без штрафа, второй в том же туре — «−4».
- Карточка игрока, «Кесте», смена языка в профиле, светлая и тёмная тема Telegram.

Ближайшие дедлайны ҚПЛ-2026: **29-й тур — 24 октября, 14:00**, **30-й тур — 31 октября, 14:00** (Алматы). Если успеваем до 31-го — играем на 30-м туре по-настоящему.

## 4. На утверждение владельцу

- Стартовые цены: `docs/research/2026-10-22-prices-draft.md` (10.0 млн — 2 игрока, 4.0 млн — 224 игрока с малым числом минут).
- Цвета форм 10 клубов, взятые по логотипам (`"verify": true` в `supabase/seed/clubs.json`): Астана, Оқжетпес, Каспий, Атырау, Ертіс, Қызылжар, Жеңіс, Жетісу, Ұлытау, Алтай. Жеңіс сделан чёрным с жёлтыми полосами, чтобы не совпадать с Қайратом.
- Скриншоты всех экранов: `docs/design/screens/` (390×844 и 320×640, светлая и тёмная тема).
