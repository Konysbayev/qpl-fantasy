import { describe, expect, it } from 'vitest';
import { errorText } from '../src/errors.js';
import { translate } from '../src/i18n/useT.js';

describe('errorText', () => {
  it('слишком частые запросы — просьба подождать минуту', () => {
    expect(errorText({ ok: false, error: 'rate_limited' }, translate('kk'))).toBe('Сұраулар тым жиі. Бір минуттан соң қайталаңыз');
  });
});
