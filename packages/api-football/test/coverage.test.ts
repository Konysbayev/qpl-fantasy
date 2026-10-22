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
  it('оценивает матч: голы с ассистом считаются без автоголов, пенальти и незабитых пенальти', () => {
    const a = assessFixture(finishedFixture, finishedFixture.players!);
    expect(a).toMatchObject({
      fixtureId: 1001,
      label: 'Kairat – Astana 2:1',
      status: 'FT',
      goalEvents: 2,
      assistableGoals: 1,
      goalEventsWithAssist: 1,
      cardEvents: 3,
      substEvents: 4,
      bundled: true,
      lineups: true,
      playersListed: 26,
      playersWithMinutes: 24
    });
    expect(a.rates.minutes).toBe(1);
    expect(a.rates.rating).toBeCloseTo(0.5, 2);
  });

  it('null в статистике игрока означает ноль: полные данные дают 100% по сверке с событиями', () => {
    const a = assessFixture(finishedFixture, finishedFixture.players!);
    expect(a.rates).toMatchObject({ assistsField: 1, cards: 1, conceded: 1, savesGk: 1 });
  });

  it('сверка ловит пропавшие данные: нет ассистов, карточек, пропущенных и сейвов', () => {
    const players = structuredClone(finishedFixture.players!);
    for (const t of players) for (const p of t.players) {
      const s = p.statistics[0];
      s.goals.assists = null;
      s.goals.saves = null;
      s.goals.conceded = 0;
      s.cards.yellow = 0;
      s.cards.red = 0;
    }
    expect(assessFixture(finishedFixture, players).rates).toMatchObject({ assistsField: 0, cards: 0, conceded: 0, savesGk: 0 });
  });

  it('нечего сверять: показатель не оценивается (null), а не 0', () => {
    const quiet = { ...finishedFixture, goals: { home: 0, away: 0 }, events: [], statistics: [] };
    const a = assessFixture(quiet, quiet.players!);
    expect(a.rates).toMatchObject({ assistsField: null, cards: null, conceded: null, savesGk: null });
  });

  it('доли считаются только по игрокам, которые выходили на поле', () => {
    const players = structuredClone(finishedFixture.players!);
    players[0].players.push({ player: { id: 900, name: 'Zero' }, statistics: [stat({ minutes: 0, rating: null })] });
    players[1].players.push({ player: { id: 901, name: 'Zero' }, statistics: [stat({ minutes: 0, rating: null })] });
    const a = assessFixture(finishedFixture, players);
    expect(a.playersWithMinutes).toBe(24);
    expect(a.rates.rating).toBeCloseTo(0.5, 2);
  });

  it('берёт игроков из самого матча, если отдельного ответа нет', () => {
    expect(assessFixture(finishedFixture, null).playersWithMinutes).toBe(24);
  });

  it('матч без игроков: ничего не NaN, минуты 0', () => {
    const a = assessFixture({ ...finishedFixture, players: [] }, null);
    expect(a.playersListed).toBe(0);
    expect(a.playersWithMinutes).toBe(0);
    expect(a.rates.minutes).toBe(0);
    expect(Object.values(a.rates).some((v) => Number.isNaN(v))).toBe(false);
    expect(a.bundled).toBe(false);
  });
});
