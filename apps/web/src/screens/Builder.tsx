// Алғашқы құрам: бос алаң (2/5/5/3 орын), тізімнен таңдау, банк 100.0 млн; «Сақтау» тек дұрыс құрамда белсенді.
import { useState } from 'react';
import type { PickInput, TeamView } from '../../../../packages/core/src/api-types.js';
import { SQUAD_RULES, validateSquad } from '../../../../packages/core/src/squad.js';
import type { Position } from '../../../../packages/core/src/types.js';
import type { Api, ClubRow, PlayerRow } from '../api.js';
import { GK_KIT } from '../components/Kit.js';
import { Pitch, type PitchItem } from '../components/Pitch.js';
import { PlayerPicker, type RowState } from '../components/PlayerPicker.js';
import { NEUTRAL_KIT } from '../components/neutral.js';
import { errorText } from '../errors.js';
import { POS_LABEL, formatDeadline, price } from '../format.js';
import { useLang, useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

export interface BuilderProps {
  view: TeamView;
  players: PlayerRow[];
  clubs: Map<string, ClubRow>;
  api: Pick<Api, 'saveLineup'>;
  onDone: () => void;
}

const ROWS: Position[] = ['FWD', 'MID', 'DEF', 'GK'];
// Негізгі 11: 1-4-4-2, қалғаны қосалқыда
const XI: Record<Position, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };

// Әр позицияда қымбаттары негізгіге; капитан мен вице — негізгідегі ең қымбат екі ойыншы
export function arrangePicks(chosen: PlayerRow[]): PickInput[] {
  const byPos = (pos: Position) => chosen.filter((p) => p.position === pos).sort((a, b) => b.price - a.price);
  const order: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
  const xi = order.flatMap((pos) => byPos(pos).slice(0, XI[pos]));
  const bench = order.flatMap((pos) => byPos(pos).slice(XI[pos]));
  const leaders = xi.filter((p) => p.position !== 'GK').sort((a, b) => b.price - a.price || b.points - a.points);
  return [...xi, ...bench].map((p, i) => ({ playerId: p.id, slot: i + 1, isCaptain: p.id === leaders[0]?.id, isVice: p.id === leaders[1]?.id }));
}

export function Builder({ view, players, clubs, api, onDone }: BuilderProps) {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
  const [chosen, setChosen] = useState<string[]>([]);
  const [lock, setLock] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = chosen.map((id) => players.find((p) => p.id === id)!);
  const bank = SQUAD_RULES.budget - picked.reduce((s, p) => s + p.price, 0);
  const count = (pos: Position) => picked.filter((p) => p.position === pos).length;
  const valid = validateSquad(picked.map((p) => ({ id: p.id, position: p.position, clubId: p.clubId, price: p.price }))).length === 0;

  const toggle = (p: PlayerRow) => {
    setError(null);
    setChosen(chosen.includes(p.id) ? chosen.filter((id) => id !== p.id) : [...chosen, p.id]);
  };
  const stateOf = (p: PlayerRow): RowState => {
    if (chosen.includes(p.id)) return 'sel';
    if (count(p.position) >= SQUAD_RULES.positions[p.position]) return 'posFull';
    if (picked.filter((x) => x.clubId === p.clubId).length >= SQUAD_RULES.maxPerClub) return 'full';
    if (p.price > bank) return 'budget';
    return 'add';
  };

  const rows: PitchItem[][] = ROWS.map((pos) => {
    const mine = picked.filter((p) => p.position === pos);
    const empties = SQUAD_RULES.positions[pos] - mine.length;
    return [
      ...mine.map((p): PitchItem => {
        const club = clubs.get(p.clubId);
        const kit = club?.kit ?? NEUTRAL_KIT;
        return { name: p.lastName, clubCode: club?.code ?? '', strip: kit.strip, points: null, role: null, kit: pos === 'GK' ? GK_KIT : kit, logoUrl: club?.logoUrl ?? null, onClick: () => toggle(p) };
      }),
      ...Array.from({ length: empties }, (): PitchItem => ({ empty: true, posLabel: POS_LABEL[lang][pos], label: tr('emptySlot', { pos: POS_LABEL[lang][pos] }), onClick: () => setLock(pos) }))
    ];
  });

  async function save() {
    if (!valid || busy || !view.next) return;
    setBusy(true);
    const r = await api.saveLineup({ gameweek: view.next.number, picks: arrangePicks(picked) });
    setBusy(false);
    if (r.ok) onDone();
    else setError(errorText(r, tr));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 16px 4px', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{tr('builderTitle')}</h1>
        {view.next && <span style={{ fontSize: 12, fontWeight: 800, color: t.primaryText }}>{formatDeadline(view.next.number, view.next.deadline, lang)}</span>}
      </header>
      <section style={{ margin: '10px 16px 0', background: t.card, borderRadius: 22, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, boxShadow: t.cardShadow }}>
        {[[tr('bank'), price(bank), tr('millionsShort')], [tr('picked'), `${chosen.length}/15`, '']].map(([label, value, unit]) => (
          <div key={label} style={{ background: t.card2, borderRadius: 16, padding: '9px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4, boxShadow: `inset 0 -2px 0 ${t.tileLip}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.muted }}>{label}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: FONT_NUM, fontSize: 20, fontWeight: 800, lineHeight: 1, color: bank < 0 && unit ? t.hard[1] : undefined }}>{value}</span>
              {unit && <span style={{ fontSize: 11, fontWeight: 800, color: t.muted }}>{unit}</span>}
            </span>
          </div>
        ))}
      </section>
      <div style={{ height: 400, margin: '12px 16px 0', display: 'flex' }}>
        <Pitch rows={rows} />
      </div>
      <PlayerPicker players={players} clubs={clubs} lockPosition={lock} stateOf={stateOf} onAction={toggle} />
      {lock && (
        <button type="button" onClick={() => setLock(null)} style={{ margin: '8px 16px 0', alignSelf: 'flex-start', height: 32, padding: '0 12px', borderRadius: 12, border: 0, background: t.soft, color: t.primaryText, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
          {tr('all')}
        </button>
      )}
      {error && <span role="alert" style={{ margin: '10px 20px 0', fontSize: 13, fontWeight: 800, color: t.hard[1] }}>{error}</span>}
      <div style={{ position: 'sticky', bottom: 0, padding: '10px 16px 0', background: `linear-gradient(180deg, transparent, ${t.bg} 30%)` }}>
        <button type="button" onClick={save} disabled={!valid || busy}
          style={{ width: '100%', height: 52, borderRadius: 18, border: 0, background: t.primary, boxShadow: `0 4px 0 ${t.lip}, inset 0 1px 0 rgba(255,255,255,0.25)`, color: '#FFFFFF', fontFamily: FONT_NUM, fontWeight: 800, fontSize: 16, cursor: valid ? 'pointer' : 'default', opacity: valid && !busy ? 1 : 0.55 }}>
          {tr('save')}
        </button>
      </div>
    </div>
  );
}
