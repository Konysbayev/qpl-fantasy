// Матчтарды турларға күні бойынша бөледі (спецификация 4.2: ауыстырылған матч нақты ойналған турға есептеледі).
// Тур дедлайны — кестедегі матчтарының алғашқысынан 1 сағат бұрын; басқа күнге ауыстырылған матчтар есепке алынбайды.

export interface FixtureSchedule {
  id: string;
  sourceTour: number | null;
  kickoff: string;
}

export interface GameweekAssignment {
  deadlines: Map<number, Date | null>;
  assignment: Map<string, number | null>;
}

const HOUR = 3_600_000;
// Турдың негізгі тобынан осы күндерден алыс матч ауыстырылған деп саналады
const ON_SCHEDULE_DAYS = 4;

export function assignGameweeks(fixtures: FixtureSchedule[], locked: Map<number, Date>): GameweekAssignment {
  const byTour = new Map<number, number[]>();
  for (const f of fixtures) {
    if (f.sourceTour === null) continue;
    const list = byTour.get(f.sourceTour) ?? [];
    list.push(Date.parse(f.kickoff));
    byTour.set(f.sourceTour, list);
  }

  const deadlines = new Map<number, Date | null>();
  for (const [tour, times] of byTour) {
    const lockedAt = locked.get(tour);
    if (lockedAt) {
      deadlines.set(tour, lockedAt);
      continue;
    }
    // Кестедегі матчтар — 4 күндік терезедегі ең тығыз топ (тең болса — кейінгісі)
    const sorted = [...times].sort((a, b) => a - b);
    let best = { start: sorted[0], count: 0 };
    for (const start of sorted) {
      const count = sorted.filter((t) => t >= start && t - start <= ON_SCHEDULE_DAYS * 24 * HOUR).length;
      if (count >= best.count) best = { start, count };
    }
    deadlines.set(tour, new Date(best.start - HOUR));
  }
  for (const [tour, at] of locked) if (!deadlines.has(tour)) deadlines.set(tour, at);

  // Матч — дедлайны матч басталғанға дейін өткен соңғы турда
  const order = [...deadlines.entries()].filter((e): e is [number, Date] => e[1] !== null).sort((a, b) => a[1].getTime() - b[1].getTime());
  const assignment = new Map<string, number | null>();
  for (const f of fixtures) {
    const t = Date.parse(f.kickoff);
    let tour: number | null = order.length > 0 ? order[0][0] : f.sourceTour;
    for (const [n, d] of order) if (d.getTime() <= t) tour = n;
    assignment.set(f.id, tour);
  }
  return { deadlines, assignment };
}
