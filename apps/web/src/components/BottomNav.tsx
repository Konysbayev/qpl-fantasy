// Төменгі мәзір: Команда · Трансфер · Лигалар · Кесте.
import { useT, type TextKey } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { ICONS } from './shapes.js';

export type Tab = 'team' | 'transfer' | 'leagues' | 'schedule';

const TABS: { id: Tab; label: TextKey }[] = [
  { id: 'team', label: 'navTeam' },
  { id: 'transfer', label: 'navTransfer' },
  { id: 'leagues', label: 'navLeagues' },
  { id: 'schedule', label: 'navSchedule' }
];

export function BottomNav({ current, onNavigate }: { current: Tab; onNavigate: (tab: Tab) => void }) {
  const t = useTheme();
  const tr = useT();
  return (
    <nav style={{ display: 'flex', margin: '10px 16px 12px', padding: 6, background: t.card, borderRadius: 24, boxShadow: t.navShadow }}>
      {TABS.map(({ id, label }) => {
        const active = id === current;
        return (
          <button key={id} type="button" aria-current={active ? 'page' : undefined} onClick={() => onNavigate(id)}
            style={{ flex: 1, minWidth: 0, height: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, border: 0, background: 'none', padding: 0, cursor: 'pointer', color: active ? t.primaryText : t.muted, fontSize: 11, fontWeight: 800, borderRadius: 18 }}>
            <span style={{ width: 46, height: 28, borderRadius: 14, background: active ? t.primary : 'transparent', boxShadow: active ? `0 2px 0 ${t.lip}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d={ICONS[id]} fill="none" stroke={active ? '#FFFFFF' : t.muted} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span style={{ maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr(label)}</span>
          </button>
        );
      })}
    </nav>
  );
}
