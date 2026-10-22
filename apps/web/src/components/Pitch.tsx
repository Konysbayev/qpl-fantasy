// Алаң: жеңіл перспектива (шабуылшылар «алыста» және кішірек), шөп жолақтары, ортаңғы шеңберде шаңырақ.
import { useTheme } from '../theme/ThemeProvider.js';
import { PlayerToken, type PlayerTokenProps } from './PlayerToken.js';
import { SHANYRAK_D } from './shapes.js';

// Жоғарыдан төмен: шабуыл, жартылай қорғаныс, қорғаныс, қақпа
const ROW_SCALE = [0.86, 0.93, 1, 1];

export function Pitch({ rows }: { rows: PlayerTokenProps[][] }) {
  const t = useTheme();
  const line = `2px solid ${t.pitchLine}`;
  return (
    <div style={{ flex: 1, minHeight: 300, position: 'relative', borderRadius: 28, overflow: 'hidden', background: `linear-gradient(180deg, ${t.surroundTop}, ${t.surroundBottom})`, boxShadow: t.pitchShadow, display: 'flex', flexDirection: 'column' }}>
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
            {row.map((p, j) => (
              <PlayerToken key={j} {...p} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
