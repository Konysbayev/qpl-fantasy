// Ойыншы таңдау: іздеу, позиция сүзгісі және тізім (Transfer макеті). Жол күйін шақырушы шешеді.
import { useState } from 'react';
import type { Position } from '../../../../packages/core/src/types.js';
import type { ClubRow, PlayerRow } from '../api.js';
import { POS_LABEL, price } from '../format.js';
import { useLang, useT } from '../i18n/useT.js';
import { matches } from '../search.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';
import { GK_KIT, Kit } from './Kit.js';
import { stripBackground } from './PlayerToken.js';
import { NEUTRAL_KIT } from './neutral.js';

export type RowState = 'add' | 'sel' | 'out' | 'full' | 'budget' | 'posFull';

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
// Тізімде бірден көрсетілетін ойыншылар саны (қалғаны — іздеу арқылы)
const LIMIT = 80;

export interface PickerProps {
  players: PlayerRow[];
  clubs: Map<string, ClubRow>;
  lockPosition?: Position | null;
  stateOf: (p: PlayerRow) => RowState;
  onAction: (p: PlayerRow) => void;
  // Тегін басқанда — ойыншы картасы
  onInfo?: (p: PlayerRow) => void;
}

export function PlayerPicker({ players, clubs, lockPosition, stateOf, onAction, onInfo }: PickerProps) {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Position | null>(null);
  const position = lockPosition ?? filter;

  const list = players
    .filter((p) => (!position || p.position === position) && matches(query, [p.lastName, p.firstName, clubs.get(p.clubId)?.nameRu, clubs.get(p.clubId)?.nameKz, clubs.get(p.clubId)?.code]))
    .sort((a, b) => b.price - a.price || b.points - a.points);
  const shown = list.slice(0, LIMIT);

  const pill = (label: string, value: Position | null) => {
    const on = position === value;
    const disabled = Boolean(lockPosition) && !on;
    return (
      <button key={label} type="button" aria-pressed={on} disabled={disabled} onClick={() => setFilter(value)}
        style={{ height: 44, padding: '0 9px', minWidth: 44, borderRadius: 15, border: 0, background: on ? t.primary : t.card, color: on ? '#FFFFFF' : t.ink, boxShadow: on ? `0 3px 0 ${t.lip}` : t.buttonShadow, fontFamily: FONT_NUM, fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, flexShrink: 0 }}>
        {label}
      </button>
    );
  };

  return (
    <>
      <div style={{ position: 'relative', margin: '12px 16px 0' }}>
        <label htmlFor="player-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{tr('search')}</label>
        <input id="player-search" type="search" placeholder={tr('search')} value={query} onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', height: 46, borderRadius: 16, border: 0, background: t.card, boxShadow: t.buttonShadow, padding: '0 14px 0 42px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: t.ink }} />
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', left: 14, top: 14 }}>
          <circle cx="11" cy="11" r="7" fill="none" stroke={t.muted} strokeWidth={2.4} />
          <path d="M16.5 16.5 L21 21" fill="none" stroke={t.muted} strokeWidth={2.4} strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 16px 0', overflowX: 'auto' }}>
        {pill(tr('all'), null)}
        {POSITIONS.map((p) => pill(POS_LABEL[lang][p], p))}
      </div>
      <ul style={{ listStyle: 'none', margin: '10px 16px 0', background: t.card, borderRadius: 22, padding: '4px 0', boxShadow: t.cardShadow }}>
        {shown.map((p, i) => (
          <Row key={p.id} p={p} club={clubs.get(p.clubId)} state={stateOf(p)} first={i === 0} onAction={() => onAction(p)} onInfo={onInfo ? () => onInfo(p) : undefined} />
        ))}
        {list.length > shown.length && (
          <li style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: t.muted }}>{tr('listMore', { n: list.length - shown.length })}</li>
        )}
      </ul>
    </>
  );
}

function Row({ p, club, state, first, onAction, onInfo }: { p: PlayerRow; club: ClubRow | undefined; state: RowState; first: boolean; onAction: () => void; onInfo?: () => void }) {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
  const kit = club?.kit ?? NEUTRAL_KIT;
  const dim = state === 'full' || state === 'budget' || state === 'posFull';
  const op = dim ? 0.45 : 1;
  const action = { width: 44, height: 44, flexShrink: 0, borderRadius: 15, border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' } as const;
  const note = { width: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, fontSize: 10, fontWeight: 800, lineHeight: 1.15, color: t.muted, textAlign: 'center' } as const;
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 8px 12px', margin: '0 4px', borderRadius: 16, background: state === 'sel' ? t.selRow : 'transparent', borderTop: `1px solid ${first || state === 'sel' ? 'transparent' : t.line}` }}>
      <div style={{ opacity: op }}>
        <Kit kit={p.position === 'GK' ? GK_KIT : kit} logoUrl={club?.logoUrl ?? null} size={38} armband={null} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, opacity: op }}>
        {onInfo ? (
          <button type="button" aria-label={`${tr('playerCard')}: ${p.lastName}`} onClick={onInfo}
            style={{ alignSelf: 'flex-start', maxWidth: '100%', border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: 14, fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.lastName}
          </button>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.lastName}</span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: t.muted, minWidth: 0 }}>
          <span aria-hidden="true" style={{ width: 14, height: 4, flexShrink: 0, borderRadius: 2, background: stripBackground(kit.strip) }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {club?.code} · {POS_LABEL[lang][p.position]} · {tr('selectedBy', { n: p.selectedPct })}
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, opacity: op }}>
        <span style={{ fontFamily: FONT_NUM, fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>{price(p.price)}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.muted, whiteSpace: 'nowrap' }}>{tr('pointsN', { n: p.points })}</span>
      </div>
      {state === 'add' && (
        <button type="button" aria-label={tr('addPlayer', { name: p.lastName })} onClick={onAction} style={{ ...action, background: t.soft, boxShadow: `0 2px 0 ${t.softLip}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 V19 M5 12 H19" fill="none" stroke={t.primaryText} strokeWidth={2.8} strokeLinecap="round" /></svg>
        </button>
      )}
      {state === 'sel' && (
        <button type="button" aria-label={tr('selectedPlayer', { name: p.lastName })} aria-pressed="true" onClick={onAction} style={{ ...action, background: t.primary, boxShadow: `0 2px 0 ${t.lip}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="#FFFFFF" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      {state === 'out' && (
        <button type="button" aria-label={tr('sellPlayer', { name: p.lastName })} onClick={onAction} style={{ ...action, background: t.card2, boxShadow: `inset 0 -2px 0 ${t.tileLip}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12 H19" fill="none" stroke={t.ink} strokeWidth={2.8} strokeLinecap="round" /></svg>
        </button>
      )}
      {state === 'full' && <span style={note}><span>{club?.code}</span><span>3/3</span></span>}
      {state === 'budget' && <span style={note}>{tr('overBudget')}</span>}
      {state === 'posFull' && <span style={note}>{tr('posFull')}</span>}
    </li>
  );
}
