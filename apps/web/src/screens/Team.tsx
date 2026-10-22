// «Менің командам»: турдың ұпайы, келесі дедлайн, алаңда 11 ойыншы және қосалқы 4; «Ауыстыру» — негізгі мен қосалқыны алмастыру.
import { useState } from 'react';
import type { PickInput, TeamPick, TeamView } from '../../../../packages/core/src/api-types.js';
import { isValidFormation } from '../../../../packages/core/src/team-score.js';
import type { Position } from '../../../../packages/core/src/types.js';
import type { Api, ClubRow } from '../api.js';
import { GK_KIT } from '../components/Kit.js';
import { NEUTRAL_KIT } from '../components/neutral.js';
import { Pitch } from '../components/Pitch.js';
import { PlayerToken, type PlayerTokenProps } from '../components/PlayerToken.js';
import { SHANYRAK_D, ICONS } from '../components/shapes.js';
import { POS_LABEL, formatDeadline } from '../format.js';
import { useLang, useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

export interface TeamProps {
  view: TeamView;
  clubs: Map<string, ClubRow>;
  api: Pick<Api, 'saveLineup'>;
  onPlayer: (playerId: string) => void;
  onChanged: () => void;
}

type Note = { kind: 'hint' | 'error' | 'ok'; text: string } | null;

// Алаң жоғарыдан төмен: шабуыл, жартылай қорғаныс, қорғаныс, қақпа
const ROWS: Position[] = ['FWD', 'MID', 'DEF', 'GK'];

export function Team({ view, clubs, api, onPlayer, onChanged }: TeamProps) {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
  const [swapping, setSwapping] = useState(false);
  const [first, setFirst] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  const picks = [...view.picks].sort((a, b) => a.slot - b.slot);
  const xi = picks.filter((p) => p.slot <= 11);
  const bench = picks.filter((p) => p.slot > 11);
  const last = view.last;
  const total = last && last.points !== null ? last.points + last.penalty : null;

  async function swap(a: TeamPick, b: TeamPick) {
    setFirst(null);
    if (a.slot <= 11 && b.slot <= 11) return setFirst(b.playerId);
    // Ойыншылар орын алмасады, капитан мен вице белгілері орнында қалады (негізгіде)
    const next: PickInput[] = picks.map((p) => ({
      playerId: p.playerId === a.playerId ? b.playerId : p.playerId === b.playerId ? a.playerId : p.playerId,
      slot: p.slot, isCaptain: p.isCaptain, isVice: p.isVice
    }));
    const position = new Map(picks.map((p) => [p.playerId, p.position]));
    if (!isValidFormation(next.filter((p) => p.slot <= 11).map((p) => position.get(p.playerId)!))) {
      setNote({ kind: 'hint', text: tr('formationHint') });
      return;
    }
    if (!view.next) return;
    setBusy(true);
    const r = await api.saveLineup({ gameweek: view.next.number, picks: next });
    setBusy(false);
    if (r.ok) {
      setNote({ kind: 'ok', text: tr('saved') });
      setSwapping(false);
      onChanged();
    } else if (r.error === 'deadline_passed') {
      setNote({ kind: 'error', text: tr('deadlinePassed') });
      onChanged();
    } else {
      setNote({ kind: 'error', text: tr('errorGeneric') });
    }
  }

  function choose(p: TeamPick) {
    if (busy) return;
    if (!first) return setFirst(p.playerId);
    if (first === p.playerId) return setFirst(null);
    void swap(picks.find((x) => x.playerId === first)!, p);
  }

  const token = (p: TeamPick, variant: 'pitch' | 'bench'): PlayerTokenProps => {
    const club = clubs.get(p.clubId);
    const kit = club?.kit ?? NEUTRAL_KIT;
    return {
      name: p.lastName, clubCode: club?.code ?? '', strip: kit.strip, logoUrl: club?.logoUrl ?? null,
      kit: p.position === 'GK' ? GK_KIT : kit,
      // Турдың капитаны (ойнамаса — вице) ұпайы еселенеді
      points: p.points === null ? null : p.points * (last?.captainId === p.playerId ? 2 : 1),
      role: p.isCaptain ? 'captain' : p.isVice ? 'vice' : null,
      onClick: () => (swapping ? choose(p) : onPlayer(p.playerId)),
      variant, posLabel: variant === 'bench' ? POS_LABEL[lang][p.position] : undefined, selected: swapping ? first === p.playerId : undefined
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <section style={{ position: 'relative', flexShrink: 0, overflow: 'hidden', margin: '4px 16px 0', background: t.card, borderRadius: 26, padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: t.cardShadow }}>
        <svg width="170" height="170" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', right: -50, bottom: -64, opacity: t.watermarkOp }}>
          <circle cx="12" cy="12" r="9" fill="none" stroke={t.primaryText} strokeWidth={1} />
          <path d={SHANYRAK_D} fill="none" stroke={t.primaryText} strokeWidth={0.9} strokeLinecap="round" />
        </svg>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {last && (
              <>
                <span style={{ background: t.primary, color: '#FFFFFF', boxShadow: `0 2px 0 ${t.lip}`, fontFamily: FONT_NUM, fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  {tr('tourN', { n: last.number })}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: t.muted }}>{tr(last.status === 'live' ? 'gwLive' : 'gwFinished')}</span>
              </>
            )}
          </div>
          {view.next && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 11px', borderRadius: 14, background: t.soft, color: t.primaryText, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="none" stroke={t.primaryText} strokeWidth={2.4} />
                <path d={ICONS.clock} fill="none" stroke={t.primaryText} strokeWidth={2.4} strokeLinecap="round" />
              </svg>
              <span>{formatDeadline(view.next.number, view.next.deadline, lang)}</span>
            </span>
          )}
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span data-testid="gw-points" style={{ fontFamily: FONT_NUM, fontWeight: 900, fontSize: 52, lineHeight: 0.9, letterSpacing: '-0.02em', textShadow: `0 3px 0 ${t.numShadow}` }}>
              {total === null ? '—' : String(total)}
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: t.muted }}>{tr('pointsUnit')}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['average', 'highest'] as const).map((k) => (
              <div key={k} style={{ background: t.card2, borderRadius: 16, padding: '8px 12px 9px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 64, boxShadow: `inset 0 -2px 0 ${t.tileLip}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.muted }}>{tr(k)}</span>
                {/* Лига кестесі 3-кезеңде */}
                <span style={{ fontFamily: FONT_NUM, fontSize: 19, fontWeight: 800, lineHeight: 1 }}>—</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div data-testid="pitch" style={{ flex: '1 0 auto', margin: '12px 16px 0', display: 'flex' }}>
        <Pitch rows={ROWS.map((pos) => xi.filter((p) => p.position === pos).map((p) => token(p, 'pitch')))} />
      </div>

      <section data-testid="bench" style={{ flexShrink: 0, margin: '12px 16px 12px', background: t.card, borderRadius: 24, padding: '10px 8px 12px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: t.cardShadow }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', gap: 8 }}>
          <span style={{ fontFamily: FONT_NUM, fontSize: 14, fontWeight: 700 }}>{tr('bench')}</span>
          {view.next && (
            <button type="button" aria-pressed={swapping} disabled={busy}
              onClick={() => { setSwapping(!swapping); setFirst(null); setNote(null); }}
              style={{ height: 32, padding: '0 12px', borderRadius: 12, border: 0, background: swapping ? t.primary : t.soft, color: swapping ? '#FFFFFF' : t.primaryText, boxShadow: `0 2px 0 ${swapping ? t.lip : t.softLip}`, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              {tr(swapping ? 'cancel' : 'swap')}
            </button>
          )}
        </div>
        {swapping && !note && <span style={{ padding: '0 8px', fontSize: 12, fontWeight: 700, color: t.muted }}>{tr('swapHelp')}</span>}
        {note && (
          <span role={note.kind === 'ok' ? 'status' : 'alert'} style={{ padding: '0 8px', fontSize: 12, fontWeight: 800, color: note.kind === 'ok' ? t.primaryText : t.hard[1] }}>
            {note.text}
          </span>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
          {bench.map((p) => (
            <PlayerToken key={p.playerId} {...token(p, 'bench')} />
          ))}
        </div>
      </section>
    </div>
  );
}
