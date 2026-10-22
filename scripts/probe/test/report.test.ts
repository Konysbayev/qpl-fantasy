import { describe, expect, it } from 'vitest';
import type { FixtureAssessment } from '../../../packages/api-football/src/coverage.js';
import type { ProbeFindings } from '../probe.js';
import { renderReport } from '../report.js';

const rates = (r: Partial<FixtureAssessment['rates']> = {}): FixtureAssessment['rates'] => ({
  minutes: 1, rating: 1, assistsField: 1, savesGk: 1, conceded: 1, cards: 1, ...r
});

const fixture = (over: Partial<FixtureAssessment> = {}): FixtureAssessment => ({
  fixtureId: 1001,
  label: 'Kairat – Astana 2:1',
  status: 'FT',
  bundled: true,
  lineups: true,
  goalEvents: 2,
  assistableGoals: 2,
  goalEventsWithAssist: 2,
  cardEvents: 3,
  substEvents: 4,
  playersListed: 26,
  playersWithMinutes: 24,
  rates: rates(),
  ...over
});

const noPlayers = fixture({ bundled: false, playersListed: 0, playersWithMinutes: 0, rates: { minutes: 0, rating: null, assistsField: null, savesGk: null, conceded: null, cards: null } });

const base: ProbeFindings = {
  account: { plan: 'Free', requestsToday: 12, limitDay: 100 },
  league: { id: 389, name: 'Premier League' },
  seasons: [],
  target: { year: 2026, accessible: true },
  sampleSeason: 2026,
  fixturesInSeason: 240,
  fixtures: [fixture()],
  live: { checked: true, liveNow: 0 },
  requestsUsed: 10,
  problems: []
};

const section4 = (md: string) => md.slice(md.indexOf('## 4.'));

describe('renderReport', () => {
  it('сезон закрыт тарифом: вопрос 1 помечен ❌ и предлагает выход', () => {
    const md = renderReport({ ...base, target: { year: 2026, accessible: false, blockedBy: 'plan', blockedMessage: 'Free plans do not have access to this season, try from 2021 to 2023.' }, sampleSeason: 2023 }, '2026-10-23');
    expect(md).toContain('❌ Бесплатный тариф не даёт сезон 2026');
    expect(md).toContain('Pro');
    expect(md).toContain('другой источник');
    expect(md).toContain('2023');
  });

  it('сезон не получен по другой причине: тариф не винит, просит повторить', () => {
    const md = renderReport({ ...base, target: { year: 2026, accessible: false, blockedBy: 'other', blockedMessage: 'token: Error/Missing application key.' }, sampleSeason: null, fixtures: [] }, '2026-10-23');
    expect(section4(md)).not.toContain('Pro');
    expect(section4(md)).toContain('Проверка не завершилась');
    expect(section4(md)).not.toContain('этапу 1');
  });

  it('рейтинга нет: предлагает отключить бонус', () => {
    const md = renderReport({ ...base, fixtures: [fixture({ rates: rates({ rating: 0 }) })] }, '2026-10-23');
    expect(md).toMatch(/\| Рейтинг игроков \| 0% \| ❌ \|/);
    expect(md).toContain('бонус');
  });

  it('показатели помечаются по порогам 90% и 30%', () => {
    const md = renderReport({ ...base, fixtures: [fixture({ rates: rates({ rating: 0.95, savesGk: 0.5, cards: 0.1 }) })] }, '2026-10-23');
    expect(md).toMatch(/\| Рейтинг игроков \| 95% \| ✅ \|/);
    expect(md).toMatch(/\| Сейвы вратарей \| 50% \| ⚠️ \|/);
    expect(md).toMatch(/\| Карточки \| 10% \| ❌ \|/);
  });

  it('ассисты в событиях: пенальти не в счёт, показаны числа «N из M»', () => {
    const md = renderReport({ ...base, fixtures: [fixture({ assistableGoals: 4, goalEventsWithAssist: 3 })] }, '2026-10-23');
    expect(md).toMatch(/\| Ассисты в событиях голов \| 75% \(3 из 4\) \| ✅ \|/);
  });

  it('нет данных об игроках: «нет данных», без NaN и без «переходить к этапу 1»', () => {
    const md = renderReport({ ...base, fixtures: [noPlayers] }, '2026-10-23');
    expect(md).toMatch(/\| Рейтинг игроков \| нет данных \| — \|/);
    expect(md).not.toContain('NaN');
    expect(md).toContain('❌ Статистики игроков нет');
    expect(section4(md)).toContain('Статистика игроков не пришла');
    expect(section4(md)).not.toContain('этапу 1');
  });

  it('матч без минут у игроков не выпадает из средней', () => {
    const md = renderReport({ ...base, fixtures: [fixture(), fixture(), fixture({ playersWithMinutes: 0, rates: rates({ minutes: 0 }) })] }, '2026-10-23');
    expect(md).toMatch(/\| Минуты игроков \| 67% \| ⚠️ \|/);
  });

  it('нет составов или минут: подсчёт очков невозможен, к этапу 1 не переходить', () => {
    const md = renderReport({ ...base, fixtures: [fixture({ lineups: false, rates: rates({ minutes: 0.1 }) })] }, '2026-10-23');
    expect(section4(md)).toContain('Не хватает');
    expect(section4(md)).not.toContain('этапу 1');
  });

  it('всё есть и сезон открыт: можно переходить к этапу 1', () => {
    const md = renderReport(base, '2026-10-23');
    expect(md).toContain('✅ Сезон 2026 доступен');
    expect(section4(md)).toContain('этапу 1');
  });
});
