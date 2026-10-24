// «Кесте»: тур матчтары күн бойынша — уақыт (Алматы), есеп немесе LIVE; турлар бағыттауыштармен ауысады.
import { useEffect, useState } from 'react';
import type { Api, ClubRow, FixtureRow, GameweekRow } from '../api.js';
import { almaty, formatDay } from '../format.js';
import { useLang, useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';
import { MatchSheet } from './MatchSheet.js';

export interface ScheduleProps {
  gameweeks: GameweekRow[];
  initial: number;
  clubs: Map<string, ClubRow>;
  api: Pick<Api, 'fixtures' | 'matchEvents'>;
}

export function Schedule({ gameweeks, initial, clubs, api }: ScheduleProps) {
  const t = useTheme();
  const tr = useT();
  const lang = useLang();
  // Турлар нақты ойналған ретпен (дедлайн бойынша): толық ауыстырылған тур (мысалы, 23-тур 17 қазанда) 28 мен 29 арасында тұрады
  const ordered = [...gameweeks].sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.number - b.number);
  const numbers = ordered.map((g) => g.number);
  // Ауыстырылған тур: нөмірі үлкенірек турдан кейін ойналады
  const moved = (n: number) => {
    const g = ordered.find((x) => x.number === n);
    return Boolean(g?.deadline && ordered.some((x) => x.number > n && x.deadline !== null && x.deadline < g.deadline!));
  };
  const [gw, setGw] = useState(initial);
  const [fixtures, setFixtures] = useState<FixtureRow[] | null>(null);
  const [open, setOpen] = useState<FixtureRow | null>(null);

  useEffect(() => {
    let alive = true;
    setFixtures(null);
    api.fixtures(gw).then((f) => alive && setFixtures([...f].sort((a, b) => a.kickoff.localeCompare(b.kickoff))), () => alive && setFixtures([]));
    return () => {
      alive = false;
    };
  }, [api, gw]);

  const i = numbers.indexOf(gw);
  const clubName = (id: string) => {
    const c = clubs.get(id);
    return c ? (lang === 'kk' ? (c.nameKz ?? c.nameRu) : c.nameRu) : '—';
  };
  const days = new Map<string, FixtureRow[]>();
  for (const f of fixtures ?? []) {
    const key = almaty(f.kickoff).date;
    days.set(key, [...(days.get(key) ?? []), f]);
  }

  const arrow = (dir: -1 | 1) => {
    const target = numbers[i + dir];
    return (
      <button type="button" aria-label={tr(dir < 0 ? 'prevTour' : 'nextTour')} disabled={target === undefined} onClick={() => target !== undefined && setGw(target)}
        style={{ width: 44, height: 44, borderRadius: 15, border: 0, background: t.card, boxShadow: t.buttonShadow, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: target === undefined ? 'default' : 'pointer', opacity: target === undefined ? 0.4 : 1 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d={dir < 0 ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19'} fill="none" stroke={t.ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  };

  const team = (id: string, align: 'left' | 'right') => {
    const logo = clubs.get(id)?.logoUrl;
    return (
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexDirection: align === 'right' ? 'row-reverse' : 'row', textAlign: align }}>
        {logo ? <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} /> : <span style={{ width: 28, flexShrink: 0 }} />}
        <span style={{ minWidth: 0, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clubName(id)}</span>
      </span>
    );
  };

  const centre = (f: FixtureRow) => {
    if (f.status === 'live') {
      return <span style={{ background: t.hard[0], color: t.hard[1], fontFamily: FONT_NUM, fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 999 }}>LIVE</span>;
    }
    if (f.status === 'finished' && f.homeScore !== null && f.awayScore !== null) {
      return <span style={{ fontFamily: FONT_NUM, fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap' }}>{`${f.homeScore} : ${f.awayScore}`}</span>;
    }
    if (f.status === 'other') return <span style={{ fontSize: 11, fontWeight: 800, color: t.muted }}>{tr('postponed')}</span>;
    return <span style={{ background: t.soft, color: t.primaryText, fontFamily: FONT_NUM, fontSize: 14, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>{almaty(f.kickoff).time}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 16px 4px' }}>
        {arrow(-1)}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.muted }}>{tr('scheduleTitle')}</span>
          <h1 style={{ margin: 0, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{tr('tourN', { n: gw })}</h1>
          {moved(gw) && (
            <span style={{ fontSize: 11, fontWeight: 800, color: t.hard[1] }}>
              {`${tr('postponed')} · ${formatDay(ordered.find((x) => x.number === gw)!.deadline!, lang)}`}
            </span>
          )}
        </div>
        {arrow(1)}
      </header>
      {fixtures === null && <span style={{ margin: '24px auto', fontWeight: 700, color: t.muted }}>{tr('loading')}</span>}
      {fixtures !== null && fixtures.length === 0 && <span style={{ margin: '24px auto', fontWeight: 700, color: t.muted }}>{tr('noMatches')}</span>}
      {[...days.entries()].map(([day, list]) => (
        <section key={day} style={{ margin: '12px 16px 0', background: t.card, borderRadius: 22, padding: '10px 10px 6px', boxShadow: t.cardShadow }}>
          <h2 style={{ margin: '0 6px 6px', fontFamily: FONT_NUM, fontSize: 14, fontWeight: 700, color: t.muted }}>{formatDay(list[0].kickoff, lang)}</h2>
          {list.map((f) => (
            // Ойналған және жүріп жатқан матчты басса — матч барысы ашылады
            <button key={f.id} type="button" data-testid="fixture" aria-label={`${clubName(f.homeClubId)} — ${clubName(f.awayClubId)}`}
              disabled={f.status !== 'finished' && f.status !== 'live'} onClick={() => setOpen(f)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 6px', border: 0, borderTop: `1px solid ${t.line}`, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'inherit', cursor: f.status === 'finished' || f.status === 'live' ? 'pointer' : 'default' }}>
              {team(f.homeClubId, 'right')}
              <span style={{ width: 68, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>{centre(f)}</span>
              {team(f.awayClubId, 'left')}
            </button>
          ))}
        </section>
      ))}
      {open && <MatchSheet fixture={open} clubs={clubs} api={api} onClose={() => setOpen(null)} />}
    </div>
  );
}
