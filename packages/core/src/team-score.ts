// Команданың турдағы ұпайы: автоауыстырулар, капитан ×2 (ол ойнамаса — вице).
import type { Position } from './types.js';

export interface Pick {
  playerId: string;
  // 1–11 негізгі құрам, 12–15 қосалқы (кезек бойынша)
  slot: number;
  isCaptain: boolean;
  isVice: boolean;
}

export interface PlayerGameweek {
  position: Position;
  // Турдағы барлық матчтың қосындысы (қос тур)
  points: number;
  played: boolean;
}

export interface TeamGameweekScore {
  total: number;
  finalXI: string[];
  subsIn: string[];
  captainId: string | null;
}

export function isValidFormation(positions: Position[]): boolean {
  const count = (p: Position) => positions.filter((x) => x === p).length;
  return positions.length === 11 && count('GK') === 1 && count('DEF') >= 3 && count('FWD') >= 1;
}

export function scoreGameweekTeam(picks: Pick[], players: Map<string, PlayerGameweek>): TeamGameweekScore {
  const info = (id: string) => {
    const p = players.get(id);
    if (!p) throw new Error(`Нет данных игрока ${id}`);
    return p;
  };
  const sorted = [...picks].sort((a, b) => a.slot - b.slot);
  const xi = sorted.filter((p) => p.slot <= 11).map((p) => p.playerId);
  const bench = sorted.filter((p) => p.slot > 11).map((p) => p.playerId);
  const subsIn: string[] = [];

  for (const out of xi.filter((id) => !info(id).played)) {
    const outIsGk = info(out).position === 'GK';
    const sub = bench.find((id) => {
      const b = info(id);
      if (!b.played || subsIn.includes(id) || (b.position === 'GK') !== outIsGk) return false;
      const next = xi.map((x) => (x === out ? id : x));
      return isValidFormation(next.map((x) => info(x).position));
    });
    if (sub) {
      xi[xi.indexOf(out)] = sub;
      subsIn.push(sub);
    }
  }

  const captain = picks.find((p) => p.isCaptain)?.playerId;
  const vice = picks.find((p) => p.isVice)?.playerId;
  const captainId = captain && xi.includes(captain) && info(captain).played ? captain : vice && xi.includes(vice) && info(vice).played ? vice : null;
  const total = xi.reduce((s, id) => s + info(id).points * (id === captainId ? 2 : 1), 0);
  return { total, finalXI: xi, subsIn, captainId };
}
