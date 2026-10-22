// Матч фактілерінен әр ойыншының статистикасын жасайды: минуттар, голдар, карточкалар, жіберілген голдар.
import type { MatchEvent, MatchFacts, MatchStatsResult, PlayerMatchStat } from './types.js';

const FULL_TIME = 90;

type ScoringEvent = Extract<MatchEvent, { kind: 'goal' | 'penalty_goal' | 'own_goal' }>;

// Оқиғалар ретін салыстыру кілті: бірінші таймның қосылған уақыты (45+2) екінші таймның басынан бұрын
const at = (minute: number, half?: number) => (half ?? (minute <= 45 ? 1 : 2)) * 1000 + minute;

// Гол қай команданың есебіне түседі: автогол — қарсыластың пайдасына
function scoringTeam(e: ScoringEvent, m: MatchFacts): number {
  if (e.kind !== 'own_goal') return e.teamSourceId;
  return e.teamSourceId === m.home.sourceId ? m.away.sourceId : m.home.sourceId;
}

export function buildPlayerMatchStats(m: MatchFacts): MatchStatsResult {
  const needsReview: string[] = [];
  // Аяқталмаған матч: соңғы оқиғаның минутына дейін ғана (90 минутқа емес) — әйтпесе құрғақ матч алдын ала беріледі
  const eventMinutes = m.events.map((e) => e.minute).filter((x): x is number => x !== null);
  const end = m.status === 'finished' ? FULL_TIME : Math.min(FULL_TIME, Math.max(0, ...eventMinutes));
  const goals = m.events.filter((e): e is ScoringEvent => e.kind === 'goal' || e.kind === 'penalty_goal' || e.kind === 'own_goal');

  const stats: PlayerMatchStat[] = m.lineups.map((p) => {
    const subIn = m.events.find((e): e is Extract<MatchEvent, { kind: 'sub' }> => e.kind === 'sub' && e.inSourceId === p.sourceId);
    const onMinute = p.starter ? 0 : subIn ? subIn.minute : null;
    const offEvent = m.events.find(
      (e): e is Exclude<MatchEvent, { kind: 'unknown' }> =>
        (e.kind === 'sub' && e.outSourceId === p.sourceId) ||
        ((e.kind === 'red' || e.kind === 'second_yellow') && e.playerSourceId === p.sourceId)
    );
    const offMinute = onMinute !== null && offEvent ? offEvent.minute : null;
    const onAt = p.starter ? at(0, 1) : subIn ? at(subIn.minute, subIn.half) : null;
    const offAt = offMinute !== null && offEvent ? at(offEvent.minute, offEvent.half) : null;

    let minutes = 0;
    if (onMinute !== null) {
      minutes = Math.min(offMinute ?? end, end) - Math.min(onMinute, end);
      // Алаңға шыққан ойыншы кемінде 1 минут алады (қосылған уақытта шыққан)
      if (minutes < 1) minutes = 1;
    }

    const own = (kind: MatchEvent['kind']) => m.events.filter((e) => e.kind === kind && 'playerSourceId' in e && e.playerSourceId === p.sourceId).length;
    const secondYellow = own('second_yellow');
    const conceded =
      onAt === null
        ? 0
        : goals.filter((e) => scoringTeam(e, m) !== p.teamSourceId && at(e.minute, e.half) >= onAt && (offAt === null || at(e.minute, e.half) < offAt)).length;

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
      penaltiesSaved: m.events.filter((e) => e.kind === 'penalty_missed' && e.savedBySourceId === p.sourceId).length,
      penaltiesMissed: own('penalty_missed')
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
