// Сервер қатесінің мәтіні: түрі мен details бойынша.
import type { ApiResult } from './api.js';
import type { T } from './i18n/useT.js';

export function errorText(r: Extract<ApiResult<unknown>, { ok: false }>, t: T): string {
  const details = 'details' in r ? (r.details ?? []) : [];
  switch (r.error) {
    case 'deadline_passed':
      return t('deadlinePassed');
    case 'wildcard_unavailable':
      return t('errWildcard');
    case 'invalid_lineup':
      return t('formationHint');
    case 'unauthorized':
      return t('loginFailed');
    case 'invalid_squad':
      if (details.includes('budget')) return t('errBudget');
      if (details.includes('club_limit')) return t('errClubLimit');
      return t('errorGeneric');
    default:
      return t('errorGeneric');
  }
}
