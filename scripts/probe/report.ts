// Зонд нәтижелерінен орыс тіліндегі есеп жасайды.
import type { FixtureAssessment } from '../../packages/api-football/src/coverage.js';
import { parseAllowedSeasons, type ProbeFindings } from './probe.js';

type Mark = '✅' | '⚠️' | '❌';
interface Row { name: string; rate: number | null }

const GOOD = 0.9;
const PARTIAL = 0.3;

const mark = (rate: number): Mark => (rate >= GOOD ? '✅' : rate >= PARTIAL ? '⚠️' : '❌');
const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const avg = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
const share = (list: FixtureAssessment[], has: (a: FixtureAssessment) => boolean) => (list.length === 0 ? null : list.filter(has).length / list.length);

function dataRows(fixtures: FixtureAssessment[]): Row[] {
  // Ойыншы көрсеткіштері тек ойыншы деректері бар матчтар бойынша орташаланады
  const withPlayers = fixtures.filter((a) => a.playersWithMinutes > 0);
  const playerRate = (key: keyof FixtureAssessment['rates']) => avg(withPlayers.map((a) => a.rates[key]));
  const goals = fixtures.reduce((s, a) => s + a.goalEvents, 0);
  const assisted = fixtures.reduce((s, a) => s + a.goalEventsWithAssist, 0);
  return [
    { name: 'Составы', rate: share(fixtures, (a) => a.lineups) },
    { name: 'События (голы, карточки, замены)', rate: share(fixtures, (a) => a.goalEvents + a.cardEvents + a.substEvents > 0) },
    { name: 'Минуты игроков', rate: playerRate('minutes') },
    { name: 'Ассисты в событиях голов', rate: goals === 0 ? null : assisted / goals },
    { name: 'Ассисты в статистике игроков', rate: playerRate('assistsField') },
    { name: 'Сейвы вратарей', rate: playerRate('savesGk') },
    { name: 'Пропущенные (вратари)', rate: playerRate('conceded') },
    { name: 'Карточки', rate: playerRate('cards') },
    { name: 'Рейтинг игроков', rate: playerRate('rating') }
  ];
}

const rowMark = (rows: Row[], name: string) => {
  const r = rows.find((x) => x.name === name);
  return r && r.rate !== null ? mark(r.rate) : null;
};

export function renderReport(f: ProbeFindings, dateIso: string): string {
  const out: string[] = [];
  const year = f.target.year;
  const planBlocked = !f.target.accessible && f.target.blockedMessage !== undefined && parseAllowedSeasons(f.target.blockedMessage) !== null;

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
  out.push('## 2. Какие данные есть', '');
  out.push(f.fixtures.length > 0
    ? `Проверено матчей: ${f.fixtures.length} (сезон ${f.sampleSeason}): ${f.fixtures.map((a) => a.label).join('; ')}.`
    : 'Матчи для проверки не найдены, данных о матчах нет.');
  out.push('', '| Показатель | Доля | Оценка |', '|---|---|---|');
  for (const r of rows) out.push(r.rate === null ? `| ${r.name} | нет данных | — |` : `| ${r.name} | ${pct(r.rate)} | ${mark(r.rate)} |`);
  out.push('');
  if (!f.live.checked) out.push('Live-запрос не выполнялся.');
  else if (f.live.error) out.push(`Live-запрос: ошибка — ${f.live.error}.`);
  else out.push(`Live-запрос работает; сейчас идёт матчей ҚПЛ: ${f.live.liveNow}.`);
  out.push('');

  out.push('## 3. Всё по матчу одним запросом', '');
  const bundled = share(f.fixtures, (a) => a.bundled);
  if (bundled === null) out.push('Нет данных: матчи не проверялись.');
  else if (bundled === 1) out.push('✅ Да: запрос `/fixtures?id=` сразу возвращает составы, события и статистику игроков.');
  else if (bundled === 0) out.push('❌ Нет: составы, события и статистику игроков придётся запрашивать отдельно.');
  else out.push(`⚠️ Частично: всё сразу пришло в ${pct(bundled)} матчей.`);
  out.push('');

  out.push('## 4. Что делать дальше', '');
  const steps: string[] = [];
  if (!f.target.accessible) {
    steps.push(`Сезон ${year} недоступен на бесплатном тарифе. Варианты: тариф **Pro** (около 19 $ в месяц, 7 500 запросов в день) или другой источник данных.`);
  }
  if (rowMark(rows, 'Рейтинг игроков') === '❌') steps.push('Рейтинга игроков нет: бонус за трёх лучших игроков матча отключаем (спецификация, раздел 4.4).');
  const assists = rowMark(rows, 'Ассисты в событиях голов');
  const saves = rowMark(rows, 'Сейвы вратарей');
  if (assists === '❌' || saves === '❌') steps.push('Ассисты и/или сейвы приходят плохо: вносить их вручную в админке.');
  else if (assists === '⚠️' || saves === '⚠️') steps.push('Ассисты и/или сейвы приходят частично: проверять и дополнять вручную в админке.');
  if (rows.every((r) => r.rate === null)) steps.push('Данных об игроках нет: повторить проверку на другом сезоне или искать другой источник.');
  if (steps.length === 0 && rows.every((r) => r.rate !== null && mark(r.rate) === '✅')) {
    steps.push('Все нужные данные есть: можно переходить к этапу 1.');
  }
  if (steps.length === 0) steps.push('Существенных проблем нет; отдельные показатели с ⚠️ проверять вручную. Можно переходить к этапу 1.');
  for (const s of steps) out.push(`- ${s}`);

  if (f.problems.length > 0) {
    out.push('', '## Замечания', '');
    for (const p of f.problems) out.push(`- ${p}`);
  }
  out.push('');
  return out.join('\n');
}
