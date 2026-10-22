import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClubKit } from '../../../packages/core/src/types.js';
import { BottomNav } from '../src/components/BottomNav.js';
import { Chip3D } from '../src/components/Chip3D.js';
import { Kit } from '../src/components/Kit.js';
import { Pitch } from '../src/components/Pitch.js';
import { PlayerToken, type PlayerTokenProps } from '../src/components/PlayerToken.js';
import { Sheet } from '../src/components/Sheet.js';
import { LangProvider } from '../src/i18n/useT.js';
import { ThemeProvider } from '../src/theme/ThemeProvider.js';
import { LIGHT } from '../src/theme/tokens.js';

afterEach(cleanup);

const KAIRAT: ClubKit = { shirt: '#F4C430', sleeves: '#F4C430', trim: '#141414', stripes: '#141414', strip: ['#F4C430', '#141414'] };
const AKTOBE: ClubKit = { shirt: '#D7262E', sleeves: '#D7262E', trim: '#FFFFFF', stripes: null, strip: ['#D7262E', '#D7262E'] };

const wrap = (node: ReactNode) => render(<ThemeProvider><LangProvider lang="kk">{node}</LangProvider></ThemeProvider>);
const token = (over: Partial<PlayerTokenProps> = {}): PlayerTokenProps => ({
  name: 'Жақсылықов', clubCode: 'ҚАЙ', strip: KAIRAT.strip, points: 8, role: null, kit: KAIRAT, logoUrl: '/clubs/13.png', onClick: () => {}, ...over
});

describe('Kit', () => {
  it('рисует вертикальные полосы только если они есть у формы, логотип на груди', () => {
    const { container } = wrap(<><Kit kit={KAIRAT} logoUrl="/clubs/13.png" size={54} armband={null} /><Kit kit={AKTOBE} logoUrl="/clubs/51.png" size={54} armband={null} /></>);
    const kits = container.querySelectorAll('[data-kit]');
    expect(kits[0].querySelector('[data-part="stripes"]')?.getAttribute('fill')).toBe('#141414');
    expect(kits[1].querySelector('[data-part="stripes"]')).toBeNull();
    expect(kits[0].querySelector('img')?.getAttribute('src')).toBe('/clubs/13.png');
  });

  it('повязка: капитан — золотая, вице — серебристая', () => {
    const { container } = wrap(<><Kit kit={AKTOBE} logoUrl={null} size={54} armband="captain" /><Kit kit={AKTOBE} logoUrl={null} size={54} armband="vice" /></>);
    const bands = [...container.querySelectorAll('[data-part="armband"]')].map((b) => b.getAttribute('fill'));
    expect(bands).toEqual([LIGHT.gold, LIGHT.viceBand]);
  });
});

describe('PlayerToken', () => {
  it('капитан: значок «К» и золотая рамка у подписи; вице: значок «В»', () => {
    wrap(<><PlayerToken {...token({ role: 'captain', name: 'Дәулетов' })} /><PlayerToken {...token({ role: 'vice', name: 'Рахимов' })} /><PlayerToken {...token({ name: 'Омаров' })} /></>);
    const captain = screen.getByRole('button', { name: /Дәулетов/ });
    expect(within(captain).getByText('К')).toBeTruthy();
    expect((captain.querySelector('[data-part="label"]') as HTMLElement).style.boxShadow).toContain(`0 0 0 2px ${LIGHT.gold}`);
    expect(within(screen.getByRole('button', { name: /Рахимов/ })).getByText('В')).toBeTruthy();
    const plain = screen.getByRole('button', { name: /Омаров/ });
    expect(within(plain).queryByText('К')).toBeNull();
    expect((plain.querySelector('[data-part="label"]') as HTMLElement).style.boxShadow).not.toContain('0 0 0 2px');
  });

  it('длинная фамилия обрезается многоточием', () => {
    wrap(<PlayerToken {...token({ name: 'Құдайбергеновтерұлы' })} />);
    const name = screen.getByText('Құдайбергеновтерұлы');
    expect(name.style.textOverflow).toBe('ellipsis');
    expect(name.style.overflow).toBe('hidden');
    expect(name.style.whiteSpace).toBe('nowrap');
  });

  it('очки, код клуба; нажатие вызывает onClick; без очков — тире', () => {
    const onClick = vi.fn();
    wrap(<><PlayerToken {...token({ onClick })} /><PlayerToken {...token({ name: 'Ержанов', points: null })} /></>);
    const btn = screen.getByRole('button', { name: /Жақсылықов/ });
    expect(within(btn).getByText('8')).toBeTruthy();
    expect(within(btn).getByText('ҚАЙ')).toBeTruthy();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
    expect(within(screen.getByRole('button', { name: /Ержанов/ })).getByText('–')).toBeTruthy();
  });
});

describe('Pitch', () => {
  it('рисует ряды игроков сверху вниз и шаңырақ в центральном круге', () => {
    const { container } = wrap(<Pitch rows={[[token({ name: 'Нап' })], [token({ name: 'Пз1' }), token({ name: 'Пз2' })], [token({ name: 'Защ' })], [token({ name: 'Вр' })]]} />);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')?.split(',')[0]);
    expect(names).toEqual(['Нап', 'Пз1', 'Пз2', 'Защ', 'Вр']);
    expect(container.querySelector('[data-part="shanyrak"]')).not.toBeNull();
  });
});

describe('Chip3D', () => {
  it('тон gold — золотой фон с бортиком', () => {
    wrap(<Chip3D tone="gold">К</Chip3D>);
    const el = screen.getByText('К');
    expect(el.style.background).toBe(hexToRgb(LIGHT.gold));
    expect(el.style.boxShadow).toContain(LIGHT.goldLip);
  });
});

describe('BottomNav', () => {
  it('текущая вкладка помечена aria-current="page", нажатие переключает', () => {
    const onNavigate = vi.fn();
    wrap(<BottomNav current="transfer" onNavigate={onNavigate} />);
    expect(screen.getByRole('button', { name: 'Трансфер' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Команда' }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Кесте' }));
    expect(onNavigate).toHaveBeenCalledWith('schedule');
  });
});

describe('Sheet', () => {
  it('закрывается по кнопке «Жабу» и клавишей Escape; закрытая шторка не рисуется', () => {
    const onClose = vi.fn();
    const { rerender } = wrap(<Sheet open onClose={onClose} label="Ойыншы картасы"><p>Мазмұны</p></Sheet>);
    expect(screen.getByRole('dialog', { name: 'Ойыншы картасы' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Жабу' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<ThemeProvider><LangProvider lang="kk"><Sheet open={false} onClose={onClose} label="Ойыншы картасы"><p>Мазмұны</p></Sheet></LangProvider></ThemeProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('свайп вниз по верхней части закрывает шторку', () => {
    const onClose = vi.fn();
    wrap(<Sheet open onClose={onClose} label="Карта"><p>x</p></Sheet>);
    const grip = screen.getByTestId('sheet-grip');
    fireEvent.pointerDown(grip, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 150, pointerId: 1 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(grip, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 220, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 220, pointerId: 1 });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
