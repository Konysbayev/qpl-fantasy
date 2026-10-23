import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Leaderboard as Board } from '../src/api.js';
import { LangProvider } from '../src/i18n/useT.js';
import { Leaderboard } from '../src/screens/Leaderboard.js';
import { TeamNameSheet } from '../src/screens/TeamNameSheet.js';
import { ThemeProvider } from '../src/theme/ThemeProvider.js';

afterEach(cleanup);
const wrap = (node: JSX.Element) => render(<ThemeProvider><LangProvider lang="ru">{node}</LangProvider></ThemeProvider>);
const row = (rank: number, me = false, teamName: string | null = `Команда ${rank}`) => ({ rank, teamName, gwPoints: 10 + rank, total: 100 - rank, me });

describe('Leaderboard', () => {
  it('до первого сыгранного тура — понятное сообщение', async () => {
    const api = { leaderboard: vi.fn().mockResolvedValue({ gameweek: null, status: null, total: 0, rows: [], me: null } satisfies Board) };
    wrap(<Leaderboard api={api} />);
    expect(await screen.findByText('Рейтинг появится после первого сыгранного тура')).toBeTruthy();
  });

  it('строки с названием команды; без названия — заглушка; своя строка отмечена и закреплена внизу, если не на странице', async () => {
    const api = { leaderboard: vi.fn().mockResolvedValue({ gameweek: 29, status: 'played', total: 120, rows: [row(1), row(2, false, null)], me: row(77, true, 'Мой клуб') } satisfies Board) };
    wrap(<Leaderboard api={api} />);
    expect(await screen.findByText('Команда 1')).toBeTruthy();
    expect(screen.getByText('Команда без названия')).toBeTruthy();
    expect(screen.getByText('после 29-го тура')).toBeTruthy();
    const mine = screen.getByText('Мой клуб').closest('[aria-current]');
    expect(mine?.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('77')).toBeTruthy();
  });

  it('«Показать ещё» догружает следующую страницу; когда всё загружено — кнопки нет', async () => {
    const api = {
      leaderboard: vi.fn()
        .mockResolvedValueOnce({ gameweek: 1, status: 'played', total: 3, rows: [row(1), row(2)], me: null })
        .mockResolvedValueOnce({ gameweek: 1, status: 'played', total: 3, rows: [row(3)], me: null })
    };
    wrap(<Leaderboard api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }));
    expect(await screen.findByText('Команда 3')).toBeTruthy();
    expect(api.leaderboard).toHaveBeenLastCalledWith(2);
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
  });
});

describe('TeamNameSheet', () => {
  it('короче 3 символов сохранить нельзя; сохранение отправляет название без пробелов по краям', async () => {
    const api = { saveProfile: vi.fn().mockResolvedValue({ ok: true, value: { lang: 'ru', notify: true, teamName: 'Барыс' } }) };
    const onSaved = vi.fn();
    wrap(<TeamNameSheet api={api} initial={null} onSaved={onSaved} />);
    const input = screen.getByLabelText('Название команды', { selector: 'input' });
    fireEvent.change(input, { target: { value: 'Ба' } });
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: '  Барыс ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Барыс'));
    expect(api.saveProfile).toHaveBeenCalledWith({ teamName: 'Барыс' });
  });

  it('сервер отказал — видна ошибка, окно не закрывается', async () => {
    const api = { saveProfile: vi.fn().mockResolvedValue({ ok: false, error: 'network' }) };
    const onSaved = vi.fn();
    wrap(<TeamNameSheet api={api} initial={null} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Название команды', { selector: 'input' }), { target: { value: 'Барыс' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
