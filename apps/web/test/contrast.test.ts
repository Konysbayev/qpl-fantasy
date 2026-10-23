import { describe, expect, it } from 'vitest';
import { DARK, LIGHT, type Tokens } from '../src/theme/tokens.js';

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Пары «текст / фон», которые реально встречаются на экранах
const pairs = (t: Tokens): [string, string, string][] => [
  ['ink/bg', t.ink, t.bg], ['ink/card', t.ink, t.card], ['ink/card2', t.ink, t.card2],
  ['muted/bg', t.muted, t.bg], ['muted/card', t.muted, t.card], ['muted/card2', t.muted, t.card2],
  ['primaryText/card', t.primaryText, t.card], ['primaryText/soft', t.primaryText, t.soft],
  ['white/primary', '#FFFFFF', t.primary], ['onGold/gold', t.onGold, t.gold], ['onVice/vice', t.onVice, t.vice],
  ['easy', t.easy[1], t.easy[0]], ['mid', t.mid[1], t.mid[0]], ['hard', t.hard[1], t.hard[0]]
];

describe('контраст текста ≥ 4.5:1 (спецификация 3.1)', () => {
  for (const [name, t] of [['светлая', LIGHT], ['тёмная', DARK]] as const) {
    for (const [pair, fg, bg] of pairs(t)) {
      it(`${name}: ${pair}`, () => {
        expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
