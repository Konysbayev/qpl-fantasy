import { cleanup } from '@testing-library/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LangProvider, type Lang } from '../src/i18n/useT.js';
import { Profile } from '../src/screens/Profile.js';
import { ThemeProvider } from '../src/theme/ThemeProvider.js';

afterEach(cleanup);

function setup(result: unknown = { ok: true, value: { lang: 'ru', notify: false } }) {
  const api = { saveProfile: vi.fn().mockResolvedValue(result) };
  const onLang = vi.fn();
  function Host() {
    const [notify, setNotify] = useState(true);
    return <Profile name="Ая" lang={'ru' as Lang} notify={notify} onNotify={setNotify} api={api} onLang={onLang} onClose={() => {}} />;
  }
  render(
    <ThemeProvider>
      <LangProvider lang="ru">
        <Host />
      </LangProvider>
    </ThemeProvider>
  );
  return { api, onLang };
}

describe('Profile', () => {
  it('переключатель уведомлений сохраняет выбор на сервере', async () => {
    const { api } = setup();
    const toggle = screen.getByRole('switch', { name: 'Уведомления в боте' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(api.saveProfile).toHaveBeenCalledWith({ notify: false }));
  });

  it('сервер отказал — переключатель возвращается назад и видна ошибка', async () => {
    setup({ ok: false, error: 'network' });
    const toggle = screen.getByRole('switch', { name: 'Уведомления в боте' });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('смена языка сохраняется на сервере (уведомления придут на выбранном языке)', async () => {
    const { api, onLang } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Қазақша' }));
    expect(onLang).toHaveBeenCalledWith('kk');
    await waitFor(() => expect(api.saveProfile).toHaveBeenCalledWith({ lang: 'kk' }));
  });
});
