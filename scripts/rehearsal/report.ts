// 2026 маусымы бойынша репетиция есебі (орыс тілінде).
import type { Position } from '../../packages/core/src/types.js';
import type { PointsLine } from '../../packages/core/src/scoring.js';
import type { SyncReport } from '../../packages/db/src/sync.js';

export interface RehearsalData {
  date: string;
  requests: number;
  sync: SyncReport;
  tours: { number: number; matches: number; top: { name: string; club: string; position: Position; points: number }[] }[];
  seasonTop: { name: string; club: string; position: Position; points: number; goals: number; assists: number; minutes: number }[];
  samples: { name: string; match: string; lines: PointsLine[]; total: number }[];
}

const POS: Record<Position, string> = { GK: 'ВР', DEF: 'ЗАЩ', MID: 'ПЗ', FWD: 'НАП' };
const LINE: Record<PointsLine['code'], string> = {
  appearance: 'Выход',
  goal: 'Гол',
  assist: 'Ассист',
  clean_sheet: 'Сухой матч',
  conceded: 'Пропущенные',
  penalty_saved: 'Отбитый пенальти',
  penalty_missed: 'Незабитый пенальти',
  yellow: 'Жёлтая',
  red: 'Удаление',
  own_goal: 'Автогол'
};

export function renderRehearsalReport(d: RehearsalData): string {
  const out: string[] = [];
  out.push('# Репетиция на сезоне ҚПЛ-2026', '', `Дата: ${d.date}. Источник: kffleague.kz. Правила очков: спецификация, раздел 4.4 (без сейвов и рейтинга).`, '');

  out.push('## 1. Сводка', '');
  out.push(`- Запросов к сайту: ${d.requests}`);
  out.push(`- Сохранено матчей: ${d.sync.stored.length}`);
  out.push(`- Пропущено (другие турниры и сезоны): ${d.sync.skipped.length}`);
  out.push(`- Ошибок загрузки: ${d.sync.failed.length}`);
  for (const f of d.sync.failed) out.push(`  - ${f.id}: ${f.error}`);
  out.push('');

  out.push('## 2. Матчи на проверку', '');
  if (d.sync.needsReview.length === 0) out.push('Матчей на проверку нет.');
  for (const m of d.sync.needsReview) out.push(`- [Матч ${m.id}](https://kffleague.kz/ru/matches/${m.id}): ${m.reasons.join('; ')}`);
  out.push('');

  out.push('## 3. Топ-20 сезона', '', '| # | Игрок | Клуб | Поз. | Очки | Голы | Ассисты | Минуты |', '|---|---|---|---|---|---|---|---|');
  d.seasonTop.forEach((p, i) => out.push(`| ${i + 1} | ${p.name} | ${p.club} | ${POS[p.position]} | ${p.points} | ${p.goals} | ${p.assists} | ${p.minutes} |`));
  out.push('');

  out.push('## 4. Лучшие игроки туров', '');
  for (const t of d.tours) {
    out.push(`### Тур ${t.number}`, '', `Матчей: ${t.matches}`, '', '| Игрок | Клуб | Поз. | Очки |', '|---|---|---|---|');
    for (const p of t.top) out.push(`| ${p.name} | ${p.club} | ${POS[p.position]} | ${p.points} |`);
    out.push('');
  }

  out.push('## 5. Расшифровки очков для ручной сверки', '');
  for (const s of d.samples) {
    out.push(`### ${s.name} — ${s.match}`, '', '| Действие | Очки |', '|---|---|');
    for (const l of s.lines) out.push(`| ${LINE[l.code]} | ${l.points > 0 ? '+' : ''}${l.points} |`);
    out.push(`| **Итого** | **${s.total}** |`, '');
  }
  return out.join('\n');
}
