import { describe, expect, it } from 'vitest';
import { assignGameweeks, type FixtureSchedule } from '../src/gameweeks.js';

// Туры по выходным: 5 — 11 апреля, 6 — 18 апреля, 7 — 25 апреля, 25 — сентябрь
function tour(sourceTour: number, date: string, n = 4, from = 1): FixtureSchedule[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${sourceTour}-${from + i}`, sourceTour, kickoff: `${date}T${String(14 + i).padStart(2, '0')}:00:00+05:00` }));
}

const season = [...tour(5, '2026-04-11'), ...tour(6, '2026-04-18'), ...tour(7, '2026-04-25'), ...tour(25, '2026-09-12')];
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

describe('assignGameweeks', () => {
  it('дедлайн тура — первый матч тура по расписанию минус 1 час', () => {
    const r = assignGameweeks(season, new Map());
    expect(iso(r.deadlines.get(6))).toBe('2026-04-18T08:00:00.000Z');
    expect(r.assignment.get('t6-1')).toBe(6);
  });

  it('матч, сыгранный раньше своего тура, попадает в тур по дате (Кайрат–Каспий: тур 25 в апреле)', () => {
    const early = { id: 'early', sourceTour: 25, kickoff: '2026-04-18T19:00:00+05:00' };
    const r = assignGameweeks([...season, early], new Map());
    expect(r.assignment.get('early')).toBe(6);
    // Дедлайн 25-го тура не уезжает в апрель
    expect(iso(r.deadlines.get(25))).toBe('2026-09-12T08:00:00.000Z');
  });

  it('отложенный матч в середине недели попадает в тур, который тогда шёл', () => {
    const late = { id: 'late', sourceTour: 5, kickoff: '2026-04-22T19:00:00+05:00' };
    const r = assignGameweeks([...season, late], new Map());
    expect(r.assignment.get('late')).toBe(6);
    expect(iso(r.deadlines.get(5))).toBe('2026-04-11T08:00:00.000Z');
  });

  it('зафиксированный дедлайн не меняется, даже если первый матч тура перенесли', () => {
    const moved = season.map((f) => (f.id === 't6-1' ? { ...f, kickoff: '2026-04-19T14:00:00+05:00' } : f));
    const locked = new Map([[6, new Date('2026-04-18T08:00:00.000Z')]]);
    const r = assignGameweeks(moved, locked);
    expect(iso(r.deadlines.get(6))).toBe('2026-04-18T08:00:00.000Z');
  });

  it('матч до первого дедлайна сезона попадает в первый тур', () => {
    const r = assignGameweeks([...season, { id: 'x', sourceTour: 5, kickoff: '2026-04-11T08:30:00+05:00' }], new Map());
    expect(r.assignment.get('x')).toBe(5);
  });

  it('матч без тура на сайте распределяется по дате', () => {
    const r = assignGameweeks([...season, { id: 'n', sourceTour: null, kickoff: '2026-04-26T19:00:00+05:00' }], new Map());
    expect(r.assignment.get('n')).toBe(7);
  });
});
