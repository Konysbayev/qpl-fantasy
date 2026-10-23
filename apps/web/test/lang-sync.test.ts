import { describe, expect, it, vi } from 'vitest';
import { syncServerLang } from '../src/lang-sync.js';

describe('syncServerLang', () => {
  it('язык, выбранный на устройстве, отправляется на сервер, если там другой', () => {
    const api = { saveProfile: vi.fn().mockResolvedValue({ ok: true, value: { lang: 'ru', notify: true } }) };
    syncServerLang('ru', 'kk', api);
    expect(api.saveProfile).toHaveBeenCalledWith({ lang: 'ru' });
  });

  it('совпадает или на устройстве ничего не выбрано — запроса нет', () => {
    const api = { saveProfile: vi.fn() };
    syncServerLang('kk', 'kk', api);
    syncServerLang(null, 'ru', api);
    expect(api.saveProfile).not.toHaveBeenCalled();
  });
});
