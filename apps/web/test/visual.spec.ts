// Витрина скриншоттары: 390×844 және 320×640, екі тема; ештеңе экран шетінен шықпайды
import { expect, test } from '@playwright/test';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '..', '..', '..', 'docs', 'design', 'screens');
const SIZES = [{ width: 390, height: 844 }, { width: 320, height: 640 }];

for (const size of SIZES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`компоненты ${size.width}×${size.height} ${theme}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(`/showcase.html?theme=${theme}`);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const bad = [...document.querySelectorAll('button, nav, section')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < -0.5 || r.right > vw + 0.5;
        });
        return { scroll: document.documentElement.scrollWidth - vw, bad: bad.length };
      });
      expect(overflow).toEqual({ scroll: 0, bad: 0 });
      await page.screenshot({ path: path.join(OUT, `components-${size.width}x${size.height}-${theme}.png`), fullPage: true });
    });
  }
}

test('шторка 390×844', async ({ page }) => {
  await page.setViewportSize(SIZES[0]);
  await page.goto('/showcase.html?sheet=1');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('dialog', { name: 'Ойыншы картасы' })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'sheet-390x844-light.png') });
});
