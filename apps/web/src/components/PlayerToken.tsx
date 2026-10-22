// Алаңдағы (және қосалқыдағы) ойыншы: футболка, тегі, клуб коды, ұпайы, клубтың екі түсті жолағы; капитан — алтын жиек пен «К».
import type { ClubKit } from '../../../../packages/core/src/types.js';
import { useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';
import { Kit } from './Kit.js';

export interface PlayerTokenProps {
  name: string;
  clubCode: string;
  strip: [string, string];
  points: number | null;
  role: 'captain' | 'vice' | null;
  kit: ClubKit;
  logoUrl: string | null;
  onClick: () => void;
  variant?: 'pitch' | 'bench';
  // Қосалқыда: позиция қысқартуы (ҚҚ, ҚОР…)
  posLabel?: string;
  // Ауыстыру үшін таңдалған
  selected?: boolean;
}

export const stripBackground = (strip: [string, string]) => `linear-gradient(90deg, ${strip[0]} 0%, ${strip[0]} 50%, ${strip[1]} 50%, ${strip[1]} 100%)`;

const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

export function PlayerToken(p: PlayerTokenProps) {
  const t = useTheme();
  const tr = useT();
  const pts = p.points === null ? '–' : String(p.points);
  const label = [p.name, p.clubCode, `${pts} ${tr('pointsUnit')}`, p.role === 'captain' ? tr('captain') : p.role === 'vice' ? tr('vice') : null].filter(Boolean).join(', ');
  const ring = p.selected ? `0 0 0 2px ${t.primary}, ` : p.role === 'captain' ? `0 0 0 2px ${t.gold}, ` : '';
  const strip = <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: stripBackground(p.strip) }} />;
  const button = { flex: '0 1 82px', width: 82, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 0, padding: 0, cursor: 'pointer' } as const;

  if (p.variant === 'bench') {
    return (
      <button type="button" aria-label={label} aria-pressed={p.selected ?? undefined} onClick={p.onClick} style={button}>
        <Kit kit={p.kit} logoUrl={p.logoUrl} size={40} armband={null} />
        <div data-part="label" style={{ position: 'relative', overflow: 'hidden', width: 'calc(100% - 4px)', maxWidth: 78, background: t.card2, borderRadius: 12, padding: '4px 4px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, boxShadow: p.selected ? `0 0 0 2px ${t.primary}` : undefined }}>
          <span style={{ maxWidth: '100%', fontSize: 11, fontWeight: 800, lineHeight: 1.2, ...ellipsis }}>{p.name}</span>
          <span style={{ maxWidth: '100%', fontSize: 10, fontWeight: 700, color: t.muted, lineHeight: 1.2, ...ellipsis }}>{[p.posLabel, p.clubCode, pts].filter(Boolean).join(' · ')}</span>
          {strip}
        </div>
      </button>
    );
  }

  const badge = p.role === 'captain' ? { text: 'К', bg: t.gold, lip: t.goldLip, fg: t.onGold } : p.role === 'vice' ? { text: 'В', bg: t.vice, lip: t.viceLip, fg: t.onVice } : null;
  const captain = p.role === 'captain';
  return (
    <button type="button" aria-label={label} aria-pressed={p.selected ?? undefined} onClick={p.onClick} style={button}>
      <Kit kit={p.kit} logoUrl={p.logoUrl} size={54} armband={p.role} />
      <div data-part="label" style={{ position: 'relative', overflow: 'hidden', width: 'calc(100% - 4px)', maxWidth: 78, background: t.chip, borderRadius: 13, padding: '4px 4px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, boxShadow: ring + t.chipShadow }}>
        <div style={{ maxWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          {badge && (
            <span aria-hidden="true" style={{ flexShrink: 0, width: 15, height: 15, borderRadius: 8, background: badge.bg, boxShadow: `0 1px 0 ${badge.lip}`, color: badge.fg, fontFamily: FONT_NUM, fontSize: 8.5, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {badge.text}
            </span>
          )}
          <span style={{ minWidth: 0, fontSize: 11, fontWeight: 800, lineHeight: 1.2, ...ellipsis }}>{p.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <span style={{ fontFamily: FONT_NUM, fontSize: 9, fontWeight: 700, letterSpacing: '0.02em', color: t.muted }}>{p.clubCode}</span>
          <span style={{ minWidth: 30, background: captain ? t.gold : t.soft, color: captain ? t.onGold : t.primaryText, boxShadow: `0 2px 0 ${captain ? t.goldLip : t.softLip}`, fontFamily: FONT_NUM, fontSize: 11, fontWeight: 700, lineHeight: 1.45, padding: '0 8px', borderRadius: 999, textAlign: 'center' }}>
            {pts}
          </span>
        </div>
        {strip}
      </div>
    </button>
  );
}
