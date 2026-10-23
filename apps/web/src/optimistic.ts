// Құрамның өзгерісі экранға серверді күтпей бірден шығады; сервер бас тартса, App бұрынғы күйді қайтарады.
import type { PickInput, TeamView } from '../../../packages/core/src/api-types.js';

export function applyPicks(view: TeamView, picks: PickInput[]): TeamView | null {
  const byId = new Map(view.picks.map((p) => [p.playerId, p]));
  if (picks.some((p) => !byId.has(p.playerId))) return null;
  return { ...view, picks: picks.map((p) => ({ ...byId.get(p.playerId)!, slot: p.slot, isCaptain: p.isCaptain, isVice: p.isVice })) };
}
