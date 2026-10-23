// Матч оқиғалары → match_events жолдары (дерек көзінің id-лерімен): тайм мен минут бойынша реттелген.
import type { MatchEvent } from '../../core/src/types.js';

export interface EventRow {
  idx: number;
  minute: number;
  kind: Exclude<MatchEvent['kind'], 'unknown'>;
  teamSourceId: number;
  playerSourceId: number | null;
  otherSourceId: number | null;
}

export function eventRows(events: MatchEvent[]): EventRow[] {
  const known = events.flatMap((e, order) => (e.kind === 'unknown' || e.minute === null ? [] : [{ e, order }]));
  const half = (e: Exclude<MatchEvent, { kind: 'unknown' }>) => e.half ?? (e.minute <= 45 ? 1 : 2);
  known.sort((a, b) => half(a.e as never) - half(b.e as never) || (a.e.minute as number) - (b.e.minute as number) || a.order - b.order);
  return known.map(({ e }, idx) => {
    const ev = e as Exclude<MatchEvent, { kind: 'unknown' }>;
    if (ev.kind === 'sub') return { idx, minute: ev.minute, kind: ev.kind, teamSourceId: ev.teamSourceId, playerSourceId: ev.inSourceId, otherSourceId: ev.outSourceId };
    if (ev.kind === 'goal' || ev.kind === 'penalty_goal' || ev.kind === 'own_goal') {
      return { idx, minute: ev.minute, kind: ev.kind, teamSourceId: ev.teamSourceId, playerSourceId: ev.playerSourceId, otherSourceId: ev.assistSourceId };
    }
    return { idx, minute: ev.minute, kind: ev.kind, teamSourceId: ev.teamSourceId, playerSourceId: ev.playerSourceId, otherSourceId: null };
  });
}
