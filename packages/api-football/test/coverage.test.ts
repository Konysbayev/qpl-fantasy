import { describe, expect, it } from 'vitest';
import { assessFixture, findKpl, seasonCoverage } from '../src/coverage.js';
import { finishedFixture, kazLeagues, kpl, stat } from './samples.js';

describe('findKpl', () => {
  it('находит именно Премьер-лигу, а не Кубок и не Первую лигу', () => {
    expect(findKpl(kazLeagues)?.league.name).toBe('Premier League');
  });

  it('не находит лигу другой страны с тем же названием', () => {
    const english = { ...kpl, country: { name: 'England' } };
    expect(findKpl([english])).toBeUndefined();
  });
});

describe('seasonCoverage', () => {
  it('возвращает покрытие нужного сезона или undefined', () => {
    expect(seasonCoverage(kpl, 2026)).toMatchObject({ year: 2026, current: true, events: true, lineups: true, fixtureStats: true, playerStats: true, injuries: false });
    expect(seasonCoverage(kpl, 1999)).toBeUndefined();
  });
});

describe('assessFixture', () => {
  it('оценивает матч: голы с ассистом считаются без автоголов и незабитых пенальти', () => {
    const a = assessFixture(finishedFixture, finishedFixture.players!);
    expect(a).toMatchObject({
      fixtureId: 1001,
      label: 'Kairat – Astana 2:1',
      status: 'FT',
      goalEvents: 2,
      goalEventsWithAssist: 1,
      cardEvents: 3,
      substEvents: 4,
      bundled: true,
      lineups: true,
      playersWithMinutes: 24
    });
    expect(a.rates.rating).toBeCloseTo(0.5, 2);
    expect(a.rates.savesGk).toBe(1);
    expect(a.rates.conceded).toBe(1);
    expect(a.rates.minutes).toBe(1);
    expect(a.rates.cards).toBe(1);
    expect(a.rates.assistsField).toBe(0);
  });

  it('доли считаются только по игрокам, которые выходили на поле', () => {
    const players = structuredClone(finishedFixture.players!);
    // Ещё два игрока с 0 минут и без рейтинга: доля рейтинга не должна измениться
    players[0].players.push({ player: { id: 900, name: 'Zero' }, statistics: [stat({ minutes: 0, rating: null })] });
    players[1].players.push({ player: { id: 901, name: 'Zero' }, statistics: [stat({ minutes: 0, rating: null })] });
    const a = assessFixture(finishedFixture, players);
    expect(a.playersWithMinutes).toBe(24);
    expect(a.rates.rating).toBeCloseTo(0.5, 2);
  });

  it('берёт игроков из самого матча, если отдельного ответа нет', () => {
    expect(assessFixture(finishedFixture, null).playersWithMinutes).toBe(24);
  });

  it('матч без игроков: доли 0, не NaN', () => {
    const a = assessFixture({ ...finishedFixture, players: [] }, null);
    expect(a.playersWithMinutes).toBe(0);
    expect(Object.values(a.rates).every((v) => v === 0)).toBe(true);
    expect(a.bundled).toBe(false);
  });
});
