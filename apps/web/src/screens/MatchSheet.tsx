// Матч барысы: голдар (автор, пас, пенальти, өз қақпасына), карточкалар, ауыстырулар — минут бойынша; үй иелері сол жақта, қонақтар оң жақта.
import { useEffect, useState } from 'react';
import type { Api, ClubRow, FixtureRow, MatchEventRow } from '../api.js';
import { Sheet } from '../components/Sheet.js';
import { useLang, useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

const ICON: Record<MatchEventRow['kind'], string> = {
  goal: '⚽', penalty_goal: '⚽', own_goal: '⚽', penalty_missed: '✖', yellow: '🟨', second_yellow: '🟨🟥', red: '🟥', sub: '🔁'
};

export function MatchSheet({ fixture, clubs, api, onClose }: { fixture: FixtureRow; clubs: Map<string, ClubRow>; api: Pick<Api, 'matchEvents'>; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
  const [events, setEvents] = useState<MatchEventRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    api.matchEvents(fixture.id).then((e) => alive && setEvents(e), () => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [api, fixture.id]);

  const clubName = (id: string) => {
    const c = clubs.get(id);
    return c ? (lang === 'kk' ? (c.nameKz ?? c.nameRu) : c.nameRu) : '—';
  };
  const score = fixture.homeScore !== null && fixture.awayScore !== null ? `${fixture.homeScore} : ${fixture.awayScore}` : '— : —';
  const tag = (e: MatchEventRow): string | null =>
    e.kind === 'penalty_goal' ? tr('penaltyTag') : e.kind === 'own_goal' ? tr('ownGoalTag') : e.kind === 'penalty_missed' ? tr('penaltyMissedTag') : e.kind === 'second_yellow' ? tr('secondYellowTag') : null;
  const note = (e: MatchEventRow): string | null =>
    e.other === null ? null : e.kind === 'sub' ? tr('subFor', { name: e.other }) : e.kind === 'goal' ? tr('assistBy', { name: e.other }) : null;

  const team = (id: string) => {
    const logo = clubs.get(id)?.logoUrl;
    return (
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {logo ? <img src={logo} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} /> : <span style={{ height: 44 }} />}
        <span style={{ maxWidth: '100%', fontSize: 14, fontWeight: 800, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clubName(id)}</span>
      </span>
    );
  };

  return (
    <Sheet open onClose={onClose} label={`${tr('matchTimeline')}: ${clubName(fixture.homeClubId)} — ${clubName(fixture.awayClubId)}`}>
      <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {team(fixture.homeClubId)}
          <span style={{ fontFamily: FONT_NUM, fontWeight: 800, fontSize: 28, whiteSpace: 'nowrap' }}>{score}</span>
          {team(fixture.awayClubId)}
        </div>
        <h2 style={{ margin: 0, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 16 }}>{tr('matchTimeline')}</h2>
        {events === null && <span style={{ fontWeight: 700, color: t.muted }}>{tr('loading')}</span>}
        {events !== null && events.length === 0 && <span style={{ fontWeight: 700, color: t.muted }}>{tr('matchEmpty')}</span>}
        <div style={{ display: 'flex', flexDirection: 'column', background: t.card, borderRadius: 20, boxShadow: t.cardShadow, padding: '4px 0' }}>
          {(events ?? []).map((e, i) => {
            const home = e.clubId === fixture.homeClubId;
            const extra = [tag(e), note(e)].filter(Boolean);
            return (
              <div key={i} data-testid="event" data-side={home ? 'home' : 'away'}
                style={{ display: 'flex', flexDirection: home ? 'row' : 'row-reverse', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i === 0 ? 0 : `1px solid ${t.line}`, textAlign: home ? 'left' : 'right' }}>
                <span style={{ width: 34, flexShrink: 0, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 14, color: t.muted, textAlign: 'center' }}>{`${e.minute}'`}</span>
                <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 16 }}>{ICON[e.kind]}</span>
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.player ?? '—'}</span>
                  {extra.map((x) => <span key={x} style={{ fontSize: 12, fontWeight: 700, color: t.muted }}>{x}</span>)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
