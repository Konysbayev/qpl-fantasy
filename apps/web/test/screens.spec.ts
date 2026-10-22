// Экрандар нақты маусым деректерімен (жалған бэкенд): 390×844 және 320×640, екі тема; ештеңе шетінен шықпайды
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { loadData, mockBackend } from '../e2e/mock.js';

const OUT = path.join(import.meta.dirname, '..', '..', '..', 'docs', 'design', 'screens');
const SIZES = [{ width: 390, height: 844 }, { width: 320, height: 640 }];
const data = loadData();
const captain = data.view.picks.find((p) => p.isCaptain)!;
const benchPlayer = data.view.picks.find((p) => p.slot === 13)!;

async function noOverflow(page: Page) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [...document.querySelectorAll('button, nav, section, li, header')].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && (b.left < -0.5 || b.right > vw + 0.5);
    }).map((el) => el.textContent?.slice(0, 30));
    return { scroll: document.documentElement.scrollWidth - vw, bad };
  });
  expect(r).toEqual({ scroll: 0, bad: [] });
}

// Алаңдағы әр ойыншы алаң ішінде толық көрінеді (биіктігі бойынша да кесілмейді)
async function pitchFits(page: Page) {
  const clipped = await page.evaluate(() => {
    const pitch = document.querySelector('[data-testid="pitch"]')!.getBoundingClientRect();
    return [...document.querySelectorAll('[data-testid="pitch"] button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.top < pitch.top - 0.5 || r.bottom > pitch.bottom + 0.5;
    }).map((b) => b.getAttribute('aria-label')?.split(',')[0]);
  });
  expect(clipped).toEqual([]);
}

// Шапка: логотип мен жазу профиль батырмасының астына кірмейді
async function headerClear(page: Page) {
  const overlap = await page.evaluate(() => {
    const button = document.querySelector('header button[aria-label]')!.getBoundingClientRect();
    return [...document.querySelectorAll('header span')].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > button.left + 0.5 && r.left < button.right && r.bottom > button.top && r.top < button.bottom;
    });
  });
  expect(overlap).toBe(false);
}

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await noOverflow(page);
  await page.screenshot({ path: path.join(OUT, name) });
}

for (const size of SIZES) {
  for (const theme of ['light', 'dark'] as const) {
    const tag = `${size.width}x${size.height}-${theme}`;
    test(`экраны ${tag}`, async ({ page }) => {
      await page.setViewportSize(size);
      await mockBackend(page, data, { theme, lang: 'kk' });
      await page.goto('/');
      await expect(page.getByTestId('pitch')).toBeVisible();
      await pitchFits(page);
      await headerClear(page);
      await shot(page, `team-${tag}.png`);

      await page.getByRole('button', { name: new RegExp(`^${captain.lastName},`) }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByTestId('next-fixture').first()).toBeVisible();
      await shot(page, `player-card-${tag}.png`);
      await page.getByRole('button', { name: 'Жабу' }).click();

      await page.getByRole('button', { name: 'Трансфер' }).click();
      await expect(page.getByRole('button', { name: /Трансферді растау/ })).toBeVisible();
      await shot(page, `transfer-${tag}.png`);
      await page.getByRole('button', { name: `Шығару: ${benchPlayer.lastName}` }).click();
      await shot(page, `transfer-in-${tag}.png`);

      await page.getByRole('button', { name: 'Кесте' }).click();
      await expect(page.getByTestId('fixture').first()).toBeVisible();
      await shot(page, `schedule-${tag}.png`);

      await page.getByRole('button', { name: 'Лигалар' }).click();
      await expect(page.getByText('Жақында: мини-лигалар')).toBeVisible();
      await shot(page, `leagues-${tag}.png`);

      await page.getByRole('button', { name: 'Команда' }).click();
      await page.getByRole('button', { name: 'Профиль' }).click();
      await page.getByRole('button', { name: 'Русский' }).click();
      await expect(page.getByText('Язык')).toBeVisible();
      await shot(page, `profile-ru-${tag}.png`);
    });
  }
}
