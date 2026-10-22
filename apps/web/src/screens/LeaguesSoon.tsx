// «Лигалар»: мини-лигалар 3-кезеңде, әзірге — хабарлама.
import { SHANYRAK_D } from '../components/shapes.js';
import { useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

export function LeaguesSoon() {
  const t = useTheme();
  const tr = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '14px 16px' }}>
      <h1 style={{ margin: '0 0 12px', fontFamily: FONT_NUM, fontWeight: 800, fontSize: 26, lineHeight: 1 }}>{tr('navLeagues')}</h1>
      <section style={{ position: 'relative', overflow: 'hidden', background: t.card, borderRadius: 26, padding: '22px 18px', boxShadow: t.cardShadow, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <svg width="170" height="170" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', right: -50, bottom: -64, opacity: t.watermarkOp }}>
          <circle cx="12" cy="12" r="9" fill="none" stroke={t.primaryText} strokeWidth={1} />
          <path d={SHANYRAK_D} fill="none" stroke={t.primaryText} strokeWidth={0.9} strokeLinecap="round" />
        </svg>
        <span style={{ alignSelf: 'flex-start', background: t.gold, color: t.onGold, boxShadow: `0 2px 0 ${t.goldLip}`, fontFamily: FONT_NUM, fontSize: 12, fontWeight: 800, padding: '4px 11px', borderRadius: 999 }}>{tr('soon')}</span>
        <h2 style={{ position: 'relative', margin: 0, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 20 }}>{tr('leaguesSoonTitle')}</h2>
        <p style={{ position: 'relative', margin: 0, fontSize: 14, fontWeight: 700, color: t.muted }}>{tr('leaguesSoonText')}</p>
      </section>
    </div>
  );
}
