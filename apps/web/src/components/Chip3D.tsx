// «Дөңес» белгі: түсті фон және астында бортик (тур нөмірі, капитан, бағалар).
import type { ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

export function Chip3D({ tone, children }: { tone: 'primary' | 'gold' | 'soft'; children: ReactNode }) {
  const t = useTheme();
  const [bg, fg, lip] = tone === 'primary' ? [t.primary, '#FFFFFF', t.lip] : tone === 'gold' ? [t.gold, t.onGold, t.goldLip] : [t.soft, t.primaryText, t.softLip];
  return (
    <span style={{ background: bg, color: fg, boxShadow: `0 2px 0 ${lip}`, fontFamily: FONT_NUM, fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}
