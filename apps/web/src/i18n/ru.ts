// Русские тексты: ключи те же, что в kk.ts (проверяется тестом и типом).
import type { kk } from './kk.js';

export const ru: Record<keyof typeof kk, string> = {
  tagline: 'Казахстанская Премьер-лига',
  unofficial: 'Неофициальная фэнтези-игра, не связана с ПФЛК',
  navTeam: 'Команда',
  navTransfer: 'Трансферы',
  navLeagues: 'Лиги',
  navSchedule: 'Календарь',
  profile: 'Профиль',
  loading: 'Загрузка…',
  loginFailed: 'Не удалось войти. Попробуйте открыть бота заново.',
  openInTelegram: 'Откройте игру в Telegram через бота',
  retry: 'Повторить',
  captain: 'капитан',
  vice: 'вице-капитан',
  bench: 'Запас',
  swap: 'Замена',
  cancel: 'Отмена',
  swapHelp: 'Выберите двух игроков, чтобы поменять их местами',
  formationHint: 'Недопустимая схема: нужен 1 вратарь, минимум 3 защитника и 1 нападающий',
  saved: 'Сохранено',
  gwFinished: 'Завершён',
  gwLive: 'Идёт',
  average: 'Средний',
  highest: 'Лучший',
  close: 'Закрыть',
  errorGeneric: 'Что-то пошло не так. Попробуйте ещё раз.',
  deadlinePassed: 'Дедлайн прошёл',
  tourN: 'Тур {n}',
  pointsUnit: 'очк.',
  millions: '{v} млн'
};
