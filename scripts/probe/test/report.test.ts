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
  goalEventsWithAssist: 2,
  cardEvents: 3,
  substEvents: 4,
  playersWithMinutes: 24,
  rates: rates(),
  ...over
});

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

describe('renderReport', () => {
  it('сезон закрыт: вопрос 1 помечен ❌ и предлагает выход', () => {
    const md = renderReport({ ...base, target: { year: 2026, accessible: false, blockedMessage: 'Free plans do not have access to this season, try from 2021 to 2023.' }, sampleSeason: 2023 }, '2026-10-23');
    expect(md).toContain('❌ Бесплатный тариф не даёт сезон 2026');
    expect(md).toContain('Pro');
    expect(md).toContain('другой источник');
    expect(md).toContain('2023');
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

  it('нет данных об игроках: пишет «нет данных», без NaN', () => {
    const md = renderReport({ ...base, fixtures: [fixture({ playersWithMinutes: 0, goalEvents: 0, goalEventsWithAssist: 0, rates: rates({ minutes: 0, rating: 0, assistsField: 0, savesGk: 0, conceded: 0, cards: 0 }) })] }, '2026-10-23');
    expect(md).toMatch(/\| Рейтинг игроков \| нет данных \| — \|/);
    expect(md).not.toContain('NaN');
  });

  it('всё есть и сезон открыт: можно переходить к этапу 1', () => {
    const md = renderReport(base, '2026-10-23');
    expect(md).toContain('✅ Сезон 2026 доступен');
    expect(md).toContain('этапу 1');
  });
});
