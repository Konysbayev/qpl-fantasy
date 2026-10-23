// Боттағы хабарламалардың мәтіні (kk/ru). Уақыт — Алматы бойынша (UTC+5, жазғы уақытқа ауыспайды).
export type NotifyKind = 'deadline_24h' | 'deadline_2h' | 'results';

export interface NotifyData {
  gameweek: number;
  deadline?: Date;
  points?: number;
  rank?: number;
  managers?: number;
}

const ALMATY_MS = 5 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');

function almaty(d: Date): { date: string; time: string } {
  const a = new Date(d.getTime() + ALMATY_MS);
  return { date: `${pad(a.getUTCDate())}.${pad(a.getUTCMonth() + 1)}`, time: `${pad(a.getUTCHours())}:${pad(a.getUTCMinutes())}` };
}

export function notifyText(kind: NotifyKind, lang: 'kk' | 'ru', d: NotifyData): string {
  const { date, time } = d.deadline ? almaty(d.deadline) : { date: '', time: '' };
  const n = d.gameweek;
  if (lang === 'ru') {
    if (kind === 'deadline_24h') return `⏰ ${n}-й тур: дедлайн завтра, ${date} в ${time}. Проверьте состав и капитана.`;
    if (kind === 'deadline_2h') return `⏳ ${n}-й тур: до дедлайна 2 часа (в ${time}). Последний шанс на трансферы.`;
    return `🏁 ${n}-й тур сыгран: ${d.points} очк., место ${d.rank} из ${d.managers}.`;
  }
  if (kind === 'deadline_24h') return `⏰ ${n}-тур: дедлайн ертең, ${date} сағат ${time}. Құрам мен капитанды тексеріңіз.`;
  if (kind === 'deadline_2h') return `⏳ ${n}-тур: дедлайнға 2 сағат қалды (${time}). Трансферге соңғы мүмкіндік.`;
  return `🏁 ${n}-тур аяқталды: ${d.points} ұпай, ${d.managers} ішінен ${d.rank}-орын.`;
}
