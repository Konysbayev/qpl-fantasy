// Зонд нәтижелерінен орыс тіліндегі есеп жасайды.
import type { FixtureAssessment } from '../../packages/api-football/src/coverage.js';
import type { ProbeFindings } from './probe.js';

type Mark = '✅' | '⚠️' | '❌';
interface Row { name: string; rate: number | null; detail?: string; good?: number }

const GOOD = 0.9;
const PARTIAL = 0.3;
// Голдардың бір бөлігі ассистсіз соғылады, сондықтан мұнда 100%-ға жету мүмкін емес
const ASSIST_EVENTS_GOOD = 0.6;

const mark = (rate: number, good = GOOD): Mark => (rate >= good ? '✅' : rate >= PARTIAL ? '⚠️' : '❌');
const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const avg = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null);
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
};
const share = (list: FixtureAssessment[], has: (a: FixtureAssessment) => boolean) => (list.length === 0 ? null : list.filter(has).length / list.length);

const LINEUPS = 'Составы';
const EVENTS = 'События (голы, карточки, замены)';
const MINUTES = 'Минуты игроков';
const ASSIST_EVENTS = 'Ассисты в событиях голов';
const SAVES = 'Сейвы вратарей';
const RATING = 'Рейтинг игроков';

function dataRows(fixtures: FixtureAssessment[]): Row[] {
  // Ойыншы көрсеткіштері ойыншылар тізімі келген барлық матч бойынша орташаланады (минутсыз матч — 0)
  const withPlayers = fixtures.filter((a) => a.playersListed > 0);
  const playerRate = (key: keyof FixtureAssessment['rates']) => avg(withPlayers.map((a) => a.rates[key]));
  const assistable = fixtures.reduce((s, a) => s + a.assistableGoals, 0);
  const assisted = fixtures.reduce((s, a) => s + a.goalEventsWithAssist, 0);
  return [
    { name: LINEUPS, rate: share(fixtures, (a) => a.lineups) },
    { name: EVENTS, rate: share(fixtures, (a) => a.goalEvents + a.cardEvents + a.substEvents > 0) },
    { name: MINUTES, rate: playerRate('minutes') },
    { name: ASSIST_EVENTS, rate: assistable === 0 ? null : assisted / assistable, detail: `${assisted} из ${assistable}`, good: ASSIST_EVENTS_GOOD },
    { name: 'Ассисты в статистике игроков (сверка с событиями)', rate: playerRate('assistsField') },
    { name: SAVES, rate: playerRate('savesGk') },
    { name: 'Пропущенные (вратари, сверка со счётом)', rate: playerRate('conceded') },
    { name: 'Карточки', rate: playerRate('cards') },
    { name: RATING, rate: playerRate('rating') }
  ];
}

const rowMark = (r: Row): Mark | null => (r.rate === null ? null : mark(r.rate, r.good));

export function renderReport(f: ProbeFindings, dateIso: string): string {
  const out: string[] = [];
  const year = f.target.year;
  const planBlocked = !f.target.accessible && f.target.blockedBy === 'plan';

  out.push('# API-Football и ҚПЛ: результаты проверки', '');
  out.push(`Дата: ${dateIso}`);
  if (f.account) out.push(`Тариф: **${f.account.plan}** · запросов сегодня: ${f.account.requestsToday} из ${f.account.limitDay}`);
  out.push(`Запросов за проверку: ${f.requestsUsed}`);
  if (f.league) out.push(`Лига в API: ${f.league.name} (ID ${f.league.id})`);
  out.push('');

  out.push(`## 1. Сезон ${year} на бесплатном тарифе`, '');
  if (f.target.accessible) {
    out.push(`✅ Сезон ${year} доступен.`);
  } else if (planBlocked) {
    out.push(`❌ Бесплатный тариф не даёт сезон ${year}. Ответ API: «${f.target.blockedMessage}».`);
    out.push(f.sampleSeason !== null ? `Чтобы оценить качество данных ҚПЛ, проверен сезон ${f.sampleSeason}.` : 'Оценить качество данных на другом сезоне не удалось.');
  } else {
    out.push(`❌ Сезон ${year} получить не удалось${f.target.blockedMessage ? `: ${f.target.blockedMessage}` : ''}.`);
  }
  if (f.seasons.length > 0) {
    out.push('', 'Покрытие, которое API заявляет для ҚПЛ:', '', '| Сезон | Текущий | События | Составы | Статистика игроков |', '|---|---|---|---|---|');
    const yn = (v: boolean) => (v ? 'да' : 'нет');
    for (const s of f.seasons) out.push(`| ${s.year} | ${yn(s.current)} | ${yn(s.events)} | ${yn(s.lineups)} | ${yn(s.playerStats)} |`);
  }
  out.push('');

  const rows = dataRows(f.fixtures);
  const noPlayerStats = f.fixtures.length > 0 && f.fixtures.every((a) => a.playersListed === 0);
  out.push('## 2. Какие данные есть', '');
  out.push(f.fixtures.length > 0
    ? `Проверено матчей: ${f.fixtures.length} (сезон ${f.sampleSeason}): ${f.fixtures.map((a) => a.label).join('; ')}.`
    : 'Матчи для проверки не найдены, данных о матчах нет.');
  const noStats = f.fixtures.filter((a) => a.playersListed === 0).length;
  if (noStats > 0 && !noPlayerStats) out.push(`Без статистики игроков: ${noStats} из ${f.fixtures.length} матчей.`);
  out.push('', '| Показатель | Доля | Оценка |', '|---|---|---|');
  for (const r of rows) {
    const m = rowMark(r);
    out.push(r.rate === null || m === null ? `| ${r.name} | нет данных | — |` : `| ${r.name} | ${pct(r.rate)}${r.detail ? ` (${r.detail})` : ''} | ${m} |`);
  }
  out.push('');
  if (!f.live.checked) out.push('Live-запрос не выполнялся.');
  else if (f.live.error) out.push(`Live-запрос: ошибка — ${f.live.error}.`);
  else out.push(`Live-запрос работает; сейчас идёт матчей ҚПЛ: ${f.live.liveNow}.`);
  out.push('');

  out.push('## 3. Всё по матчу одним запросом', '');
  const bundled = share(f.fixtures, (a) => a.bundled);
  if (bundled === null) out.push('Нет данных: матчи не проверялись.');
  else if (noPlayerStats) out.push('❌ Статистики игроков нет ни в запросе матча, ни в отдельном запросе `/fixtures/players`.');
  else if (bundled === 1) out.push('✅ Да: запрос `/fixtures?id=` сразу возвращает составы, события и статистику игроков.');
  else if (bundled === 0) out.push('❌ Нет: составы, события или статистику игроков придётся запрашивать отдельно.');
  else out.push(`⚠️ Частично: всё сразу пришло в ${pct(bundled)} матчей.`);
  out.push('');

  out.push('## 4. Что делать дальше', '');
  const steps: string[] = [];
  const blockers: string[] = [];
  if (!f.target.accessible) {
    if (planBlocked) {
      blockers.push(`Сезон ${year} недоступен на бесплатном тарифе. Варианты: тариф **Pro** (около 19 $ в месяц, 7 500 запросов в день) или другой источник данных.`);
    } else {
      blockers.push(`Проверка не завершилась: сезон ${year} получить не удалось (см. замечания). Исправить причину и повторить проверку.`);
    }
  }
  if (noPlayerStats) {
    blockers.push('Статистика игроков не пришла ни в одном матче: минуты, сейвы и рейтинг пришлось бы вносить вручную. Лучше проверить тариф Pro или искать другой источник.');
  }
  const essential = rows.filter((r) => [LINEUPS, EVENTS, MINUTES].includes(r.name) && rowMark(r) === '❌');
  if (essential.length > 0 && !noPlayerStats) {
    blockers.push(`Не хватает: ${essential.map((r) => r.name.toLowerCase()).join(', ')}. Без этого очки не посчитать: нужен другой источник или ручной ввод.`);
  }
  const rating = rows.find((r) => r.name === RATING)!;
  if (rowMark(rating) === '❌') steps.push('Рейтинга игроков нет: бонус за трёх лучших игроков матча отключаем (спецификация, раздел 4.4).');
  const weak = rows.filter((r) => r.name !== RATING && ![LINEUPS, EVENTS, MINUTES].includes(r.name));
  const bad = weak.filter((r) => rowMark(r) === '❌').map((r) => r.name.toLowerCase());
  const partial = rows.filter((r) => rowMark(r) === '⚠️').map((r) => r.name.toLowerCase());
  if (bad.length > 0) steps.push(`Приходят плохо: ${bad.join(', ')}. Вносить вручную в админке.`);
  if (partial.length > 0) steps.push(`Приходят частично: ${partial.join(', ')}. Проверять и дополнять вручную.`);

  const unknown = rows.some((r) => r.rate === null);
  const clean = blockers.length === 0 && !unknown && f.problems.length === 0;
  for (const s of [...blockers, ...steps]) out.push(`- ${s}`);
  if (clean && steps.length === 0) out.push('- Все нужные данные есть: можно переходить к этапу 1.');
  else if (clean) out.push('- Серьёзных препятствий нет: можно переходить к этапу 1 с ручной проверкой отмеченных показателей.');
  else if (blockers.length === 0) out.push('- Часть показателей не удалось оценить (см. «нет данных» и замечания): повторить проверку на других матчах, прежде чем решать.');

  if (f.problems.length > 0) {
    out.push('', '## Замечания', '');
    for (const p of f.problems) out.push(`- ${p}`);
  }
  out.push('');
  return out.join('\n');
}
