// Жалпы рейтинг: орын, команда атауы, тур ұпайы, жалпы ұпай. Өз жолы белгіленеді; бетте жоқ болса — астында бекітіледі.
import { useEffect, useState } from 'react';
import { LEADERBOARD_PAGE, type Api, type Leaderboard as Board, type LeaderRow } from '../api.js';
import { useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

export function Leaderboard({ api }: { api: Pick<Api, 'leaderboard'> }) {
  const t = useTheme();
  const tr = useT();
  const [board, setBoard] = useState<Board | null>(null);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.leaderboard(0).then(
      (b) => {
        if (!alive) return;
        setBoard(b);
        setRows(b.rows);
      },
      () => alive && setFailed(true)
    );
    return () => {
      alive = false;
    };
  }, [api]);

  async function more() {
    setBusy(true);
    try {
      const b = await api.leaderboard(rows.length);
      setRows((r) => [...r, ...b.rows]);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const card = { background: t.card, borderRadius: 22, boxShadow: t.cardShadow, padding: '6px 0' } as const;
  if (failed) return <p style={{ margin: 0, fontWeight: 700, color: t.muted }}>{tr('errorGeneric')}</p>;
  if (!board) return <p style={{ margin: 0, fontWeight: 700, color: t.muted }}>{tr('loading')}</p>;
  if (board.gameweek === null) return <section style={{ ...card, padding: '18px 16px' }}><p style={{ margin: 0, fontWeight: 700, color: t.muted }}>{tr('leaderboardEmpty')}</p></section>;

  const meShown = rows.some((r) => r.me);
  const subtitle = tr(board.status === 'live' ? 'leaderboardLive' : 'leaderboardAfter', { n: board.gameweek });
  const line = (r: LeaderRow, key: string) => (
    <div key={key} aria-current={r.me ? 'true' : undefined}
      style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 36px 48px', alignItems: 'center', gap: 8, padding: '10px 12px', background: r.me ? t.soft : 'transparent', borderRadius: r.me ? 14 : 0 }}>
      <span style={{ fontFamily: FONT_NUM, fontWeight: 800, fontSize: 15, color: r.me ? t.primaryText : t.ink }}>{r.rank}</span>
      <span style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: r.teamName ? t.ink : t.muted }}>{r.teamName ?? tr('noTeamName')}</span>
      <span style={{ fontFamily: FONT_NUM, fontWeight: 700, fontSize: 14, textAlign: 'right', color: t.muted }}>{r.gwPoints}</span>
      <span style={{ fontFamily: FONT_NUM, fontWeight: 800, fontSize: 15, textAlign: 'right' }}>{r.total}</span>
    </div>
  );

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 19 }}>{tr('leaderboardTitle')}</h2>
        <span style={{ fontSize: 12, fontWeight: 800, color: t.muted }}>{subtitle}</span>
      </div>
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 36px 48px', gap: 8, padding: '6px 12px', fontSize: 11, fontWeight: 800, color: t.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <span>#</span><span />
          <span style={{ textAlign: 'right' }}>{tr('leaderboardGw')}</span>
          <span style={{ textAlign: 'right' }}>{tr('leaderboardTotal')}</span>
        </div>
        {rows.map((r, i) => line(r, `${r.rank}-${i}`))}
        {!meShown && board.me && (
          <div style={{ borderTop: `1px dashed ${t.line}`, marginTop: 4, paddingTop: 4 }}>{line(board.me, 'me')}</div>
        )}
      </div>
      {rows.length < board.total && (
        <button type="button" onClick={more} disabled={busy}
          style={{ height: 44, borderRadius: 16, border: 0, background: t.card2, color: t.primaryText, boxShadow: `inset 0 -2px 0 ${t.tileLip}`, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
          {tr('loadMore')}
        </button>
      )}
    </section>
  );
}

