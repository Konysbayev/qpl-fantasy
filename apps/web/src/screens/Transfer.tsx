// Трансфер (макет Transfer.dc.html): банк, тегін трансферлер, шегерім; «Шығады → Кіреді»; іздеу мен тізім; айыппұл алдын ала көрсетіледі.
import { useEffect, useRef, useState } from 'react';
import type { TeamView } from '../../../../packages/core/src/api-types.js';
import { transferPenalty } from '../../../../packages/core/src/squad.js';
import type { Api, ClubRow, PlayerRow } from '../api.js';
import { GK_KIT, Kit } from '../components/Kit.js';
import { PlayerPicker, type RowState } from '../components/PlayerPicker.js';
import { NEUTRAL_KIT } from '../components/neutral.js';
import { ICONS } from '../components/shapes.js';
import { errorText } from '../errors.js';
import { formatDeadline, price } from '../format.js';
import { useLang, useT } from '../i18n/useT.js';
import { newRequestId } from '../uuid.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

export interface TransferProps {
  view: TeamView;
  players: PlayerRow[];
  clubs: Map<string, ClubRow>;
  api: Pick<Api, 'transfer'>;
  initialOut: string | null;
  onDone: () => void;
  onPlayer?: (playerId: string) => void;
}

type Owned = { id: string; lastName: string; position: PlayerRow['position']; clubId: string; price: number };
type Note = { kind: 'ok' | 'error'; text: string } | null;

const minus = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

export function Transfer({ view, players, clubs, api, initialOut, onDone, onPlayer }: TransferProps) {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
  const squad = view.squad!;
  const [owned, setOwned] = useState<Owned[]>(() => view.picks.map((p) => ({ id: p.playerId, lastName: p.lastName, position: p.position, clubId: p.clubId, price: p.price })));
  const [bank, setBank] = useState(squad.bank);
  const [free, setFree] = useState(squad.freeTransfers);
  const [penaltyTotal, setPenaltyTotal] = useState(squad.penalty);
  const [wildcardActive, setWildcardActive] = useState(squad.wildcardActive);
  const [wildcardOn, setWildcardOn] = useState(false);
  // Wildcard жартысезонға бір-ақ рет: қосар алдында сұраймыз
  const [wildcardAsk, setWildcardAsk] = useState(false);
  const [outId, setOutId] = useState<string | null>(initialOut);
  const [inId, setInId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const swapRef = useRef<HTMLElement>(null);
  // Бір ниетке (шығатын, кіретін, Wildcard) — бір requestId: желі үзілсе, қайталау сол id-мен кетеді
  const request = useRef<{ key: string; id: string } | null>(null);

  // Сервер деректері жаңарса (қайта жүктеу) — жергілікті күй солармен теңеседі
  useEffect(() => {
    if (!view.squad) return;
    setOwned(view.picks.map((p) => ({ id: p.playerId, lastName: p.lastName, position: p.position, clubId: p.clubId, price: p.price })));
    setBank(view.squad.bank);
    setFree(view.squad.freeTransfers);
    setPenaltyTotal(view.squad.penalty);
    setWildcardActive(view.squad.wildcardActive);
  }, [view]);
  const [note, setNote] = useState<Note>(null);

  // Тізім төмен айналған болса — «Шығады → Кіреді» картасына қайтамыз
  useEffect(() => {
    if (outId) swapRef.current?.scrollIntoView?.({ block: 'start' });
  }, [outId]);

  const out = owned.find((o) => o.id === outId) ?? null;
  const inn = players.find((p) => p.id === inId) ?? null;
  const ownedIds = new Set(owned.map((o) => o.id));
  const clubCount = (clubId: string) => owned.filter((o) => o.clubId === clubId && o.id !== outId).length;
  const penalty = transferPenalty(1, { freeTransfers: free, unlimited: squad.unlimited, wildcard: wildcardActive || wildcardOn }).penalty;

  const candidates = out ? players.filter((p) => !ownedIds.has(p.id) && p.position === out.position) : players.filter((p) => ownedIds.has(p.id));
  const stateOf = (p: PlayerRow): RowState => {
    if (!out) return 'out';
    if (p.id === inId) return 'sel';
    if (clubCount(p.clubId) >= 3) return 'full';
    if (p.price > bank + out.price) return 'budget';
    return 'add';
  };
  const onAction = (p: PlayerRow) => {
    setNote(null);
    if (!out) return setOutId(p.id);
    setInId(p.id === inId ? null : p.id);
  };

  async function confirm() {
    if (sending.current || !out || !inn || !view.next) return;
    sending.current = true;
    setBusy(true);
    const wildcard = wildcardOn;
    const key = `${out.id}|${inn.id}|${wildcard}`;
    if (request.current?.key !== key) request.current = { key, id: newRequestId() };
    let r: Awaited<ReturnType<typeof api.transfer>>;
    try {
      // Бір растауға бір requestId: желі «жыпылықтаса», сервер екінші рет есептен шығармайды
      r = await api.transfer({ requestId: request.current.id, gameweek: view.next.number, out: [out.id], in: [inn.id], wildcard });
    } finally {
      sending.current = false;
      setBusy(false);
    }
    if (!r.ok) {
      setNote({ kind: 'error', text: errorText(r, tr) });
      // Сервер жауабы келсе, келесі әрекет — жаңа ниет; желі үзілсе — сол id сақталады
      if (r.error !== 'network') request.current = null;
      // Құрам басқа жерде өзгерген — серверден қайта оқимыз
      if (r.error === 'not_owned') onDone();
      return;
    }
    request.current = null;
    setOwned(owned.map((o) => (o.id === out.id ? { id: inn.id, lastName: inn.lastName, position: inn.position, clubId: inn.clubId, price: inn.price } : o)));
    setBank(r.value.bank);
    setFree(r.value.freeLeft);
    setPenaltyTotal(penaltyTotal + r.value.penalty);
    if (wildcard) setWildcardActive(true);
    setWildcardOn(false);
    setOutId(null);
    setInId(null);
    setNote({ kind: 'ok', text: tr('transferDone') });
    onDone();
  }

  const tile = (label: string, value: string, unit?: string) => (
    <div style={{ background: t.card2, borderRadius: 16, padding: '9px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4, boxShadow: `inset 0 -2px 0 ${t.tileLip}`, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: FONT_NUM, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 11, fontWeight: 800, color: t.muted }}>{unit}</span>}
      </span>
    </div>
  );

  const swapCard = (who: 'out' | 'in', p: { lastName: string; clubId: string; position: PlayerRow['position']; price: number } | null) => {
    const club = p ? clubs.get(p.clubId) : undefined;
    const kit = club?.kit ?? NEUTRAL_KIT;
    const isIn = who === 'in';
    return (
      <button type="button" disabled={!p} onClick={() => (isIn ? setInId(null) : (setOutId(null), setInId(null)))}
        aria-label={p ? `${tr(isIn ? 'inLabel' : 'outLabel')}: ${p.lastName}` : tr(isIn ? 'chooseIn' : 'chooseOut')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 16, border: 0, minWidth: 0, minHeight: 58, textAlign: 'left', cursor: p ? 'pointer' : 'default', background: isIn ? t.soft : t.card2, boxShadow: isIn && p ? `inset 0 0 0 2px ${t.primary}` : 'none' }}>
        {p ? <Kit kit={p.position === 'GK' ? GK_KIT : kit} logoUrl={club?.logoUrl ?? null} size={38} armband={null} /> : <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, border: `2px dashed ${t.sheetLine}` }} />}
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: isIn ? t.primaryText : t.muted }}>{tr(isIn ? 'inLabel' : 'outLabel')}</span>
          <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p ? p.lastName : '—'}</span>
          {p && <span style={{ fontSize: 11, fontWeight: 700, color: isIn ? t.primaryText : t.muted }}>{club?.code} · {price(p.price)}</span>}
        </span>
      </button>
    );
  };

  const canConfirm = Boolean(out && inn) && !busy;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 16px 4px', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 26, lineHeight: 1, letterSpacing: '-0.01em' }}>{tr('transferTitle')}</h1>
        {view.next && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 15, background: t.soft, color: t.primaryText, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke={t.primaryText} strokeWidth={2.4} /><path d={ICONS.clock} fill="none" stroke={t.primaryText} strokeWidth={2.4} strokeLinecap="round" /></svg>
            <span>{formatDeadline(view.next.number, view.next.deadline, lang)}</span>
          </span>
        )}
      </header>
      <section style={{ margin: '10px 16px 0', background: t.card, borderRadius: 22, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, boxShadow: t.cardShadow }}>
        {tile(tr('bank'), price(bank), tr('millionsShort'))}
        {tile(tr('freeTransfers'), squad.unlimited || wildcardActive ? '∞' : String(free))}
        {tile(tr('penaltyLabel'), minus(penaltyTotal), tr('pointsUnit'))}
      </section>
      {!squad.unlimited && (squad.wildcardAvailable || wildcardActive) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 16px 0' }}>
          {wildcardActive ? (
            <span style={{ height: 32, padding: '0 12px', borderRadius: 12, background: t.gold, color: t.onGold, boxShadow: `0 2px 0 ${t.goldLip}`, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center' }}>{tr('wildcardActive')}</span>
          ) : (
            <button type="button" aria-pressed={wildcardOn} onClick={() => (wildcardOn ? setWildcardOn(false) : setWildcardAsk(true))}
              style={{ height: 32, padding: '0 12px', borderRadius: 12, border: 0, background: wildcardOn ? t.gold : t.soft, color: wildcardOn ? t.onGold : t.primaryText, boxShadow: `0 2px 0 ${wildcardOn ? t.goldLip : t.softLip}`, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              {tr('wildcard')}
            </button>
          )}
        </div>
      )}
      {wildcardAsk && (
        <div role="alertdialog" aria-label={tr('wildcard')} style={{ margin: '8px 16px 0', padding: 12, borderRadius: 16, background: t.card, boxShadow: t.cardShadow, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{tr('wildcardConfirm')}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => { setWildcardOn(true); setWildcardAsk(false); }}
              style={{ flex: 1, height: 40, borderRadius: 12, border: 0, background: t.gold, color: t.onGold, boxShadow: `0 2px 0 ${t.goldLip}`, fontWeight: 800, cursor: 'pointer' }}>{tr('yesEnable')}</button>
            <button type="button" onClick={() => setWildcardAsk(false)}
              style={{ flex: 1, height: 40, borderRadius: 12, border: 0, background: t.card2, color: t.ink, fontWeight: 800, cursor: 'pointer' }}>{tr('no')}</button>
          </div>
        </div>
      )}
      <section ref={swapRef} data-testid="swap-card" style={{ scrollMarginTop: 12, margin: '10px 16px 0', background: t.card, borderRadius: 22, padding: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 30px minmax(0, 1fr)', alignItems: 'center', gap: 4, boxShadow: t.cardShadow }}>
        {swapCard('out', out)}
        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 15, background: t.primary, boxShadow: `0 2px 0 ${t.lip}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M5 12 H19 M13 6 L19 12 L13 18" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        {swapCard('in', inn)}
      </section>
      <span style={{ margin: '10px 20px 0', fontSize: 12, fontWeight: 700, color: t.muted }}>{tr(out ? 'chooseIn' : 'chooseOut')}</span>
      <PlayerPicker players={candidates} clubs={clubs} lockPosition={out?.position ?? null} stateOf={stateOf} onAction={onAction} onInfo={onPlayer ? (p) => onPlayer(p.id) : undefined} />
      {note && (
        <span role={note.kind === 'ok' ? 'status' : 'alert'} style={{ margin: '10px 20px 0', fontSize: 13, fontWeight: 800, color: note.kind === 'ok' ? t.primaryText : t.hard[1] }}>{note.text}</span>
      )}
      <div style={{ position: 'sticky', bottom: 0, padding: '10px 16px 0', background: `linear-gradient(180deg, transparent, ${t.bg} 30%)` }}>
        <button type="button" onClick={confirm} disabled={!canConfirm} aria-busy={busy}
          style={{ width: '100%', height: 52, borderRadius: 18, border: 0, background: t.primary, boxShadow: `0 4px 0 ${t.lip}, inset 0 1px 0 rgba(255,255,255,0.25)`, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: canConfirm ? 'pointer' : 'default', opacity: canConfirm ? 1 : 0.55 }}>
          <span style={{ fontFamily: FONT_NUM, fontWeight: 800, fontSize: 16 }}>{tr('confirmTransfer')}</span>
          <span style={{ fontWeight: 800, fontSize: 12 }}>· {penalty === 0 ? tr('noPenalty') : tr('pointsN', { n: minus(penalty) })}</span>
        </button>
      </div>
    </div>
  );
}
