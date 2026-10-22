// Матч фактілерінен әр ойыншының статистикасын жасайды: минуттар, голдар, карточкалар, жіберілген голдар.
import type { MatchEvent, MatchFacts, MatchStatsResult, PlayerMatchStat } from './types.js';

const FULL_TIME = 90;

type ScoringEvent = Extract<MatchEvent, { kind: 'goal' | 'penalty_goal' | 'own_goal' }>;

// Гол қай команданың есебіне түседі: автогол — қарсыластың пайдасына
function scoringTeam(e: ScoringEvent, m: MatchFacts): number {
  if (e.kind !== 'own_goal') return e.teamSourceId;
  return e.teamSourceId === m.home.sourceId ? m.away.sourceId : m.home.sourceId;
}

export function buildPlayerMatchStats(m: MatchFacts): MatchStatsResult {
  const needsReview: string[] = [];
  const goals = m.events.filter((e): e is ScoringEvent => e.kind === 'goal' || e.kind === 'penalty_goal' || e.kind === 'own_goal');

  const stats: PlayerMatchStat[] = m.lineups.map((p) => {
    const subIn = m.events.find((e) => e.kind === 'sub' && e.inSourceId === p.sourceId);
    const onMinute = p.starter ? 0 : subIn ? subIn.minute : null;
    const offEvent = m.events.find(
      (e) =>
        (e.kind === 'sub' && e.outSourceId === p.sourceId) ||
        ((e.kind === 'red' || e.kind === 'second_yellow') && e.playerSourceId === p.sourceId)
    );
    const offMinute = onMinute !== null && offEvent && offEvent.minute !== null ? offEvent.minute : null;

    let minutes = 0;
    if (onMinute !== null) {
      minutes = Math.min(offMinute ?? FULL_TIME, FULL_TIME) - Math.min(onMinute, FULL_TIME);
      // Алаңға шыққан ойыншы кемінде 1 минут алады (қосылған уақытта шыққан)
      if (minutes < 1) minutes = 1;
    }

    const own = (kind: MatchEvent['kind']) => m.events.filter((e) => e.kind === kind && 'playerSourceId' in e && e.playerSourceId === p.sourceId).length;
    const secondYellow = own('second_yellow');
    const conceded =
      onMinute === null
        ? 0
        : goals.filter((e) => scoringTeam(e, m) !== p.teamSourceId && e.minute >= onMinute && (offMinute === null || e.minute < offMinute)).length;

    return {
      playerSourceId: p.sourceId,
      teamSourceId: p.teamSourceId,
      position: p.position,
      minutes,
      onMinute,
      offMinute,
      goals: own('goal') + own('penalty_goal'),
      assists: goals.filter((e) => e.kind !== 'own_goal' && e.assistSourceId === p.sourceId).length,
      penaltyGoals: own('penalty_goal'),
      ownGoals: own('own_goal'),
      // Екінші сары: тек қызыл есептеледі, алғашқы сары жойылады
      yellow: secondYellow > 0 ? 0 : own('yellow'),
      red: secondYellow > 0 || own('red') > 0 ? 1 : 0,
      conceded,
      penaltiesSaved: 0,
      penaltiesMissed: 0
    };
  });

  if (m.status === 'finished' && m.homeScore !== null && m.awayScore !== null) {
    const home = goals.filter((e) => scoringTeam(e, m) === m.home.sourceId).length;
    const away = goals.filter((e) => scoringTeam(e, m) === m.away.sourceId).length;
    if (home !== m.homeScore || away !== m.awayScore) {
      needsReview.push(`Счёт ${m.homeScore}:${m.awayScore}, а по событиям голов ${home}:${away}`);
    }
  }
  for (const e of m.events) {
    if (e.kind === 'unknown') needsReview.push(`Неизвестное событие «${e.rawType}» на ${e.minute ?? '?'}-й минуте`);
  }
  for (const p of m.lineups) {
    if (p.starter && p.position === null) needsReview.push(`Нет позиции у игрока основы ${p.firstName} ${p.lastName} (id ${p.sourceId})`);
  }
  return { stats, needsReview };
}
