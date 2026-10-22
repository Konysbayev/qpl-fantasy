// Алаң: жеңіл перспектива (шабуылшылар «алыста» және кішірек), шөп жолақтары, ортаңғы шеңберде шаңырақ.
import { useTheme } from '../theme/ThemeProvider.js';
import { PlayerToken, type PlayerTokenProps } from './PlayerToken.js';
import { SHANYRAK_D, SHIRT_D } from './shapes.js';

// Бос орын (алғашқы құрамды жинағанда): үзік сызықты футболка мен позиция
export interface EmptySlot {
  empty: true;
  label: string;
  posLabel: string;
  onClick: () => void;
}

export type PitchItem = PlayerTokenProps | EmptySlot;

// Жоғарыдан төмен: шабуыл, жартылай қорғаныс, қорғаныс, қақпа. Алаң ойыншыларды ешқашан кеспейді (биіктігі — мазмұнынан кем емес)
const ROW_SCALE = [0.86, 0.93, 1, 1];

export function Pitch({ rows }: { rows: PitchItem[][] }) {
  const t = useTheme();
  const line = `2px solid ${t.pitchLine}`;
  return (
    <div style={{ flex: 1, minHeight: 'min-content', position: 'relative', borderRadius: 28, overflow: 'hidden', background: `linear-gradient(180deg, ${t.surroundTop}, ${t.surroundBottom})`, boxShadow: t.pitchShadow, display: 'flex', flexDirection: 'column' }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: -34, bottom: -6, transform: 'perspective(560px) rotateX(20deg)', transformOrigin: '50% 100%', background: `repeating-linear-gradient(180deg, ${t.grass1} 0px, ${t.grass1} 46px, ${t.grass2} 46px, ${t.grass2} 92px)` }}>
        <div style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 22, border: line, borderRadius: 6 }} />
        <div style={{ position: 'absolute', left: 16, right: 16, top: '50%', borderTop: line }} />
        <div style={{ position: 'absolute', left: '50%', top: 16, width: 184, height: 62, marginLeft: -92, border: line, borderTop: 0 }} />
        <div style={{ position: 'absolute', left: '50%', bottom: 22, width: 184, height: 62, marginLeft: -92, border: line, borderBottom: 0 }} />
        <svg data-part="shanyrak" width="116" height="116" viewBox="0 0 24 24" style={{ position: 'absolute', left: '50%', top: '50%', margin: '-58px 0 0 -58px' }}>
          <circle cx="12" cy="12" r="9" fill={t.grass2} stroke={t.pitchLine} strokeWidth={0.4} />
          <path d={SHANYRAK_D} fill="none" stroke={t.pitchLine} strokeWidth={0.34} strokeLinecap="round" />
        </svg>
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 32%)' }} />
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', padding: '10px 4px 12px' }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'center', gap: 2, transform: `scale(${ROW_SCALE[i] ?? 1})`, transformOrigin: '50% 50%' }}>
            {row.map((p, j) => ('empty' in p ? <Empty key={j} {...p} /> : <PlayerToken key={j} {...p} />))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ label, posLabel, onClick }: EmptySlot) {
  const t = useTheme();
  return (
    <button type="button" aria-label={label} onClick={onClick}
      style={{ flex: '0 1 82px', width: 82, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
      <svg width="54" height="54" viewBox="0 0 40 40" aria-hidden="true">
        <path d={SHIRT_D} fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.85)" strokeWidth={1.1} strokeDasharray="2.2 1.8" strokeLinejoin="round" />
      </svg>
      <span style={{ background: t.chip, borderRadius: 13, padding: '3px 10px', fontSize: 11, fontWeight: 800, color: t.muted, boxShadow: t.chipShadow }}>{posLabel}</span>
    </button>
  );
}
