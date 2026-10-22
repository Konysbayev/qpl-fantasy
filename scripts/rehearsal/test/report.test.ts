import { describe, expect, it } from 'vitest';
import { renderRehearsalReport, type RehearsalData } from '../report.js';

function data(over: Partial<RehearsalData> = {}): RehearsalData {
  return {
    date: '2026-10-22',
    requests: 870,
    sync: { stored: [993, 994], skipped: [5], failed: [{ id: 7, error: 'HTTP 403' }], needsReview: [{ id: 993, reasons: ['Счёт 2:4, а по событиям голов 2:3'] }] },
    tours: [{ number: 14, matches: 8, top: [{ name: 'Марин Томасов', club: 'Астана', position: 'FWD', points: 13 }] }],
    seasonTop: [{ name: 'Марин Томасов', club: 'Астана', position: 'FWD', points: 150, goals: 18, assists: 7, minutes: 2400 }],
    samples: [{
      name: 'Марин Томасов', match: 'Астана 3:1 Кайсар (тур 14)', total: 13,
      lines: [
        { code: 'appearance', points: 2 }, { code: 'goal', points: 8 }, { code: 'assist', points: 3 },
        { code: 'clean_sheet', points: 1 }, { code: 'conceded', points: -1 }, { code: 'yellow', points: -1 },
        { code: 'red', points: -3 }, { code: 'own_goal', points: -2 }
      ]
    }],
    ...over
  };
}

describe('renderRehearsalReport', () => {
  it('есть пять разделов', () => {
    const r = renderRehearsalReport(data());
    for (const h of ['## 1. Сводка', '## 2. Матчи на проверку', '## 3. Топ-20 сезона', '## 4. Лучшие игроки туров', '## 5. Расшифровки очков для ручной сверки']) {
      expect(r).toContain(h);
    }
  });

  it('сводка: запросы, сохранено, пропущено, ошибки с причиной', () => {
    const r = renderRehearsalReport(data());
    expect(r).toContain('870');
    expect(r).toMatch(/Сохранено матчей: 2/);
    expect(r).toMatch(/Пропущено .*: 1/);
    expect(r).toContain('7: HTTP 403');
  });

  it('матч на проверку выводится с причиной', () => {
    expect(renderRehearsalReport(data())).toContain('Счёт 2:4, а по событиям голов 2:3');
  });

  it('без матчей на проверку пишет «Матчей на проверку нет»', () => {
    const r = renderRehearsalReport(data({ sync: { stored: [1], skipped: [], failed: [], needsReview: [] } }));
    expect(r).toContain('Матчей на проверку нет');
  });

  it('расшифровка очков по-русски', () => {
    const r = renderRehearsalReport(data());
    for (const word of ['Выход', 'Гол', 'Ассист', 'Сухой матч', 'Пропущенные', 'Жёлтая', 'Удаление', 'Автогол']) expect(r).toContain(word);
    expect(r).toContain('Астана 3:1 Кайсар (тур 14)');
    expect(r).toMatch(/Итого.*13/);
  });

  it('топ сезона и туров выводятся таблицами', () => {
    const r = renderRehearsalReport(data());
    expect(r).toMatch(/\| 1 \| Марин Томасов \| Астана \| НАП \| 150 \| 18 \| 7 \| 2400 \|/);
    expect(r).toMatch(/### Тур 14/);
  });
});
