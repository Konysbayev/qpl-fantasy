// Турнир кестесі аяқталған матчтардан: жеңіс — 3 ұпай, тең — 1; тең болса — гол айырмасы, соққан голдар.
import type { FixtureRow } from './api.js';

export function standings(fixtures: FixtureRow[], clubIds: string[]): Map<string, number> {
  const rows = new Map(clubIds.map((id) => [id, { id, pts: 0, gd: 0, gf: 0 }]));
  for (const f of fixtures) {
    if (f.status !== 'finished' || f.homeScore === null || f.awayScore === null) continue;
    const home = rows.get(f.homeClubId);
    const away = rows.get(f.awayClubId);
    if (!home || !away) continue;
    home.gf += f.homeScore;
    away.gf += f.awayScore;
    home.gd += f.homeScore - f.awayScore;
    away.gd += f.awayScore - f.homeScore;
    if (f.homeScore > f.awayScore) home.pts += 3;
    else if (f.homeScore < f.awayScore) away.pts += 3;
    else {
      home.pts += 1;
      away.pts += 1;
    }
  }
  const sorted = [...rows.values()].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return new Map(sorted.map((r, i) => [r.id, i + 1]));
}
