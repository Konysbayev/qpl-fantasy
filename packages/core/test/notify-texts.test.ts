import { describe, expect, it } from 'vitest';
import { notifyText } from '../src/notify-texts.js';

const deadline = new Date('2026-10-31T09:00:00Z');

describe('notifyText', () => {
  it('напоминания и итоги на русском, время по Алматы', () => {
    expect(notifyText('deadline_24h', 'ru', { gameweek: 30, deadline })).toBe('⏰ 30-й тур: дедлайн завтра, 31.10 в 14:00. Проверьте состав и капитана.');
    expect(notifyText('deadline_2h', 'ru', { gameweek: 30, deadline })).toBe('⏳ 30-й тур: до дедлайна 2 часа (в 14:00). Последний шанс на трансферы.');
    expect(notifyText('results', 'ru', { gameweek: 29, points: 54, rank: 3, managers: 12 })).toBe('🏁 29-й тур сыгран: 54 очк., место 3 из 12.');
  });

  it('то же на казахском', () => {
    expect(notifyText('deadline_24h', 'kk', { gameweek: 30, deadline })).toBe('⏰ 30-тур: дедлайн ертең, 31.10 сағат 14:00. Құрам мен капитанды тексеріңіз.');
    expect(notifyText('deadline_2h', 'kk', { gameweek: 30, deadline })).toBe('⏳ 30-тур: дедлайнға 2 сағат қалды (14:00). Трансферге соңғы мүмкіндік.');
    expect(notifyText('results', 'kk', { gameweek: 29, points: 54, rank: 3, managers: 12 })).toBe('🏁 29-тур аяқталды: 54 ұпай, 12 ішінен 3-орын.');
  });

  it('полночь по Алматы: 19:00 UTC → 00:00 следующего дня', () => {
    expect(notifyText('deadline_2h', 'ru', { gameweek: 1, deadline: new Date('2026-10-31T19:00:00Z') })).toContain('(в 00:00)');
    expect(notifyText('deadline_24h', 'ru', { gameweek: 1, deadline: new Date('2026-10-31T19:00:00Z') })).toContain('01.11 в 00:00');
  });
});
