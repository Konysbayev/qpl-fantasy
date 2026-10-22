// Жоғарғы бөлік: QPL Fantasy белгісі (шаңырақ) және профиль батырмасы.
import { useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';
import { ICONS, SHANYRAK_TILE_D } from './shapes.js';

export function Header({ onProfile }: { onProfile?: () => void }) {
  const t = useTheme();
  const tr = useT();
  return (
    <header style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 66, padding: '6px 16px 2px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 46, height: 46, borderRadius: 16, background: `linear-gradient(160deg, ${t.markTop}, ${t.markBottom})`, boxShadow: `0 4px 0 ${t.lip}, inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -8px 14px rgba(0,0,0,0.14)`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-6deg)' }}>
          <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" style={{ filter: 'drop-shadow(0 1px 0 rgba(4,45,75,0.35))' }}>
            <circle cx="12" cy="12" r="9.6" fill="none" stroke="#FFC83D" strokeWidth={2.4} />
            <circle cx="12" cy="12" r="7.6" fill="none" stroke="#FFC83D" strokeWidth={0.55} opacity={0.8} />
            <path d={SHANYRAK_TILE_D} fill="none" stroke="#FFC83D" strokeWidth={1.15} strokeLinecap="round" />
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span style={{ fontFamily: FONT_NUM, fontWeight: 900, fontSize: 25, letterSpacing: '-0.015em', lineHeight: 1 }}>
            <span style={{ color: t.primaryText, textShadow: `0 2px 0 ${t.numShadow}` }}>QPL</span> Fantasy
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.muted, lineHeight: 1 }}>{tr('tagline')}</span>
        </div>
      </div>
      {onProfile && (
        <button type="button" aria-label={tr('profile')} onClick={onProfile}
          style={{ position: 'absolute', right: 16, top: '50%', marginTop: -20, width: 44, height: 44, borderRadius: 22, border: 0, background: t.card, boxShadow: t.buttonShadow, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" fill="none" stroke={t.ink} strokeWidth={2} />
            <path d={ICONS.person} fill="none" stroke={t.ink} strokeWidth={2} strokeLinecap="round" />
          </svg>
        </button>
      )}
    </header>
  );
}
