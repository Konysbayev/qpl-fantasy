// Ойыншы картасы (Player.dc.html): клуб түсіндегі баннер, маусым көрсеткіштері, соңғы 5 тур, келесі 3 матч қиындығымен,
// «Капитан ету», «Вице-капитан», «Трансферге шығару».
import { useEffect, useState } from 'react';
import type { PickInput, TeamView } from '../../../../packages/core/src/api-types.js';
import { fixtureDifficulty, type Difficulty } from '../../../../packages/core/src/difficulty.js';
import type { Position } from '../../../../packages/core/src/types.js';
import type { Api, ClubRow, FixtureRow, PlayerMatchRow, SeasonStats } from '../api.js';
import { Sheet } from '../components/Sheet.js';
import { NEUTRAL_KIT } from '../components/neutral.js';
import { ICONS } from '../components/shapes.js';
import { errorText } from '../errors.js';
import { price } from '../format.js';
import { useLang, useT, type TextKey } from '../i18n/useT.js';
import { standings } from '../standings.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

export interface CardPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  clubId: string;
  price: number;
  selectedPct: number | null;
}

export interface PlayerCardProps {
  player: CardPlayer;
  view: TeamView;
  clubs: Map<string, ClubRow>;
  api: Pick<Api, 'seasonStats' | 'playerMatches' | 'fixtures' | 'saveLineup'>;
  onClose: () => void;
  onTransferOut: (playerId: string) => void;
  onChanged: () => void;
  // Карточка жабылғаннан кейінгі сервер қатесі (App хабарлама ретінде көрсетеді)
  onError?: (text: string) => void;
}

const POSITION_NAME: Record<Position, TextKey> = { GK: 'posGK', DEF: 'posDEF', MID: 'posMID', FWD: 'posFWD' };
const LEVEL: Record<Difficulty, TextKey> = { easy: 'diffEasy', mid: 'diffMid', hard: 'diffHard' };

// Түсті қараңғылату (баннер градиентінің екінші түсі)
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

const groupThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function PlayerCard({ player, view, clubs, api, onClose, onTransferOut, onChanged, onError }: PlayerCardProps) {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
  const [stats, setStats] = useState<SeasonStats | null>(null);
  const [matches, setMatches] = useState<PlayerMatchRow[]>([]);
  const [fixtures, setFixtures] = useState<FixtureRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    api.seasonStats(player.id).then((s) => alive && setStats(s), () => {});
    api.playerMatches(player.id).then((m) => alive && setMatches(m), () => {});
    api.fixtures().then((f) => alive && setFixtures(f), () => alive && setFixtures([]));
    return () => {
      alive = false;
    };
  }, [api, player.id]);

  const club = clubs.get(player.clubId);
  const clubName = (c: ClubRow | undefined) => (c ? (lang === 'kk' ? (c.nameKz ?? c.nameRu) : c.nameRu) : '');
  const kit = club?.kit ?? NEUTRAL_KIT;
  const light = luminance(kit.shirt) > 0.45;
  const fg = light ? '#0F1C26' : '#FFFFFF';
  const fg2 = light ? 'rgba(15,28,38,0.72)' : 'rgba(255,255,255,0.82)';

  const pick = view.picks.find((p) => p.playerId === player.id);
  const inXI = Boolean(pick && pick.slot <= 11);

  // Соңғы 5 тур: қос турда ұпайлар қосылады
  const byGw = new Map<number, number>();
  for (const m of matches) byGw.set(m.gameweek, (byGw.get(m.gameweek) ?? 0) + m.points);
  const lastTours = [...byGw.entries()].slice(-5);

  const ranks = fixtures ? standings(fixtures, [...clubs.keys()]) : null;
  const next = (fixtures ?? [])
    .filter((f) => f.status !== 'finished' && (f.homeClubId === player.clubId || f.awayClubId === player.clubId))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 3);

  async function setRole(role: 'captain' | 'vice') {
    if (!view.next) return;
    const current = view.picks.find((p) => (role === 'captain' ? p.isCaptain : p.isVice));
    const wasOther = role === 'captain' ? pick?.isVice : pick?.isCaptain;
    // Вице капитан болса (немесе керісінше) — рөлдер орын алмасады; әйтпесе бұрынғысы қатардағы ойыншы болады
    const picks: PickInput[] = view.picks.map((p) => {
      const target = p.playerId === player.id;
      const previous = p.playerId === current?.playerId;
      let { isCaptain, isVice } = p;
      if (role === 'captain') {
        isCaptain = target;
        if (target) isVice = false;
        else if (previous && wasOther) isVice = true;
      } else {
        isVice = target;
        if (target) isCaptain = false;
        else if (previous && wasOther) isCaptain = true;
      }
      return { playerId: p.playerId, slot: p.slot, isCaptain, isVice };
    });
    // Карточка бірден жабылады, белгі алаңда бірден ауысады; сервер бас тартса — App қатені көрсетеді
    const pending = api.saveLineup({ gameweek: view.next.number, picks });
    onClose();
    const r = await pending;
    if (!r.ok) onError?.(errorText(r, tr));
    onChanged();
  }

  const statTiles: [TextKey, string][] = [
    ['statPoints', String(stats?.points ?? 0)], ['statGoals', String(stats?.goals ?? 0)], ['statAssists', String(stats?.assists ?? 0)],
    ['statCleanSheets', String(stats?.cleanSheets ?? 0)], ['statMinutes', groupThousands(stats?.minutes ?? 0)], ['statYellow', String(stats?.yellow ?? 0)]
  ];
  const h2 = { margin: 0, fontFamily: FONT_NUM, fontWeight: 700, fontSize: 15 } as const;
  const roleButton = (role: 'captain' | 'vice') => {
    const captain = role === 'captain';
    const active = captain ? pick?.isCaptain : pick?.isVice;
    const [bg, lip, color] = captain ? [t.gold, t.goldLip, t.onGold] : [t.soft, t.softLip, t.primaryText];
    return (
      <button type="button" onClick={() => setRole(role)} disabled={active} aria-pressed={active}
        style={{ height: 52, borderRadius: 17, border: 0, background: bg, boxShadow: `0 4px 0 ${lip}${captain ? ', inset 0 1px 0 rgba(255,255,255,0.4)' : ''}`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', opacity: active ? 0.6 : 1 }}>
        <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, background: color, color: bg, fontFamily: FONT_NUM, fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{captain ? 'К' : 'В'}</span>
        <span style={{ fontFamily: FONT_NUM, fontWeight: 800, fontSize: 15 }}>{tr(captain ? 'makeCaptain' : 'makeVice')}</span>
      </button>
    );
  };

  return (
    <Sheet open onClose={onClose} label={`${tr('playerCard')}: ${player.firstName} ${player.lastName}`}>
      <div style={{ position: 'relative', overflow: 'hidden', margin: '8px 16px 0', height: 150, borderRadius: 22, background: `linear-gradient(135deg, ${kit.shirt} 0%, ${shade(kit.shirt, 0.45)} 100%)`, boxShadow: `0 4px 0 ${shade(kit.shirt, 0.6)}`, display: 'flex', alignItems: 'flex-end', gap: 14, padding: '0 16px' }}>
        {club?.logoUrl && <img src={club.logoUrl} alt="" style={{ position: 'absolute', right: -34, top: -26, width: 170, height: 170, objectFit: 'contain', opacity: 0.16 }} />}
        <div style={{ position: 'relative', width: 104, height: 128, flexShrink: 0, borderRadius: '18px 18px 0 0', border: `2px dashed ${light ? 'rgba(15,28,38,0.4)' : 'rgba(255,255,255,0.5)'}`, borderBottom: 0, background: 'rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8.5" r="4" fill="none" stroke={fg} strokeWidth={1.6} />
            <path d={ICONS.person} fill="none" stroke={fg} strokeWidth={1.6} strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 800, color: fg }}>{tr('photo')}</span>
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 5, color: fg }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: fg2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.firstName}</span>
          <span style={{ fontFamily: FONT_NUM, fontWeight: 800, fontSize: 23, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.lastName}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, minWidth: 0 }}>
            {club?.logoUrl && <img src={club.logoUrl} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />}
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clubName(club)} · {tr(POSITION_NAME[player.position])}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{ background: '#FFFFFF', color: '#0F1C26', fontFamily: FONT_NUM, fontWeight: 800, fontSize: 13, padding: '3px 10px', borderRadius: 999, boxShadow: '0 2px 0 rgba(0,0,0,0.25)' }}>{tr('millions', { v: price(player.price) })}</span>
            {player.selectedPct !== null && <span style={{ fontSize: 12, fontWeight: 700, color: fg2 }}>{tr('selectedBy', { n: player.selectedPct })}</span>}
          </span>
        </div>
      </div>

      <div style={{ margin: '14px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {statTiles.map(([label, value]) => (
          <div key={label} style={{ background: t.card2, borderRadius: 16, padding: '9px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4, boxShadow: `inset 0 -2px 0 ${t.tileLip}`, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr(label)}</span>
            <span style={{ fontFamily: FONT_NUM, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{value}</span>
          </div>
        ))}
      </div>

      {lastTours.length > 0 && (
        <div style={{ margin: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={h2}>{tr('lastTours')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
            {lastTours.map(([gw, pts]) => (
              <div key={gw} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ width: '100%', height: 36, borderRadius: 12, background: t.soft, boxShadow: `0 2px 0 ${t.softLip}`, color: t.primaryText, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pts}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: t.muted }}>{tr('tourN', { n: gw })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {next.length > 0 && ranks && (
        <div style={{ margin: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 style={{ ...h2, marginBottom: 2 }}>{tr('nextMatches')}</h2>
          {next.map((f) => {
            const home = f.homeClubId === player.clubId;
            const opponent = clubs.get(home ? f.awayClubId : f.homeClubId);
            const level = fixtureDifficulty(ranks.get(opponent?.id ?? '') ?? clubs.size, clubs.size);
            const [bg, color] = t[level];
            return (
              <div key={f.id} data-testid="next-fixture" style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 12px', borderRadius: 14, background: t.card2 }}>
                <span style={{ width: 44, flexShrink: 0, fontSize: 11, fontWeight: 800, color: t.muted }}>{tr('tourN', { n: f.gameweek })}</span>
                {opponent?.logoUrl && <img src={opponent.logoUrl} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />}
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clubName(opponent)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.muted }}>{tr(home ? 'atHome' : 'away')}</span>
                </span>
                <span style={{ background: bg, color, fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{tr(LEVEL[level])}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ margin: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {inXI && view.next && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {roleButton('captain')}
            {roleButton('vice')}
          </div>
        )}
        {pick && view.next && (
          <button type="button" onClick={() => onTransferOut(player.id)}
            style={{ height: 44, borderRadius: 14, border: 0, background: 'transparent', color: t.primaryText, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.transfer} fill="none" stroke={t.primaryText} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span style={{ fontFamily: FONT_NUM, fontWeight: 700, fontSize: 14 }}>{tr('toTransfer')}</span>
          </button>
        )}
      </div>
    </Sheet>
  );
}
