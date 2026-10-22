// Қосымша: тема, тіл, Telegram арқылы кіру, деректерді жүктеу және экрандар арасында ауысу.
import { useCallback, useEffect, useState } from 'react';
import { api, type ClubRow, type PlayerRow, type Session, type TeamView } from './api.js';
import { BottomNav, type Tab } from './components/BottomNav.js';
import { Header } from './components/Header.js';
import { LangProvider, detectLang, useT, type Lang } from './i18n/useT.js';
import { Builder } from './screens/Builder.js';
import { PlayerCard, type CardPlayer } from './screens/PlayerCard.js';
import { Team } from './screens/Team.js';
import { Transfer } from './screens/Transfer.js';
import { tg } from './telegram.js';
import { ThemeProvider, useTheme } from './theme/ThemeProvider.js';

type Boot = { state: 'loading' } | { state: 'outside' } | { state: 'error' } | { state: 'ready'; session: Session };

export function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang(tg().languageCode));
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const login = useCallback(() => {
    if (!tg().initData) {
      setBoot({ state: 'outside' });
      return;
    }
    setBoot({ state: 'loading' });
    api.login().then(
      (session) => {
        setLang(session.user.lang);
        setBoot({ state: 'ready', session });
      },
      () => setBoot({ state: 'error' })
    );
  }, []);
  useEffect(login, [login]);

  return (
    <ThemeProvider>
      <LangProvider lang={lang}>
        {boot.state === 'ready' ? <Main /> : <Splash boot={boot} onRetry={login} />}
      </LangProvider>
    </ThemeProvider>
  );
}

interface Data {
  view: TeamView;
  clubs: Map<string, ClubRow>;
}

function Main() {
  const th = useTheme();
  const t = useT();
  const [tab, setTab] = useState<Tab>('team');
  const [data, setData] = useState<Data | null>(null);
  const [players, setPlayers] = useState<PlayerRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [transferOut, setTransferOut] = useState<string | null>(null);
  const [card, setCard] = useState<CardPlayer | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([api.teamView(), api.clubs()]).then(
      ([view, clubs]) => setData({ view, clubs: new Map(clubs.map((c) => [c.id, c])) }),
      () => setFailed(true)
    );
  }, []);
  useEffect(load, [load]);

  // Ойыншылар тізімі трансфер мен алғашқы құрамға ғана керек
  const building = data !== null && data.view.squad === null && data.view.next !== null;
  const needPlayers = building || tab === 'transfer';
  useEffect(() => {
    if (needPlayers && !players) api.players().then(setPlayers, () => setFailed(true));
  }, [needPlayers, players]);

  const reload = () => {
    load();
    setPlayers(null);
  };

  let screen;
  if (failed) screen = <Message text={t('errorGeneric')} onRetry={reload} />;
  else if (!data || (needPlayers && !players)) screen = <Message text={t('loading')} />;
  else if (building) screen = <Builder view={data.view} players={players!} clubs={data.clubs} api={api} onDone={reload} />;
  else if (tab === 'team') screen = <Team view={data.view} clubs={data.clubs} api={api} onPlayer={(id) => setCard(cardPlayer(id, data.view, players))} onChanged={load} />;
  else if (tab === 'transfer' && data.view.squad) screen = <Transfer key={transferOut ?? ''} view={data.view} players={players!} clubs={data.clubs} api={api} initialOut={transferOut} onDone={load} />;
  else screen = <Message text={t('loading')} />;

  const navigate = (next: Tab) => {
    setTransferOut(null);
    setTab(next);
  };

  return (
    <div style={{ minHeight: '100vh', height: '100vh', maxWidth: 480, margin: '0 auto', background: th.bg, color: th.ink, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {tab === 'team' && !building && <Header />}
      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>{screen}</main>
      {!building && <BottomNav current={tab} onNavigate={navigate} />}
      {card && data && (
        <PlayerCard player={card} view={data.view} clubs={data.clubs} api={api} onClose={() => setCard(null)} onChanged={load}
          onTransferOut={(id) => {
            setCard(null);
            setTransferOut(id);
            setTab('transfer');
          }} />
      )}
    </div>
  );
}

function cardPlayer(id: string, view: TeamView, players: PlayerRow[] | null): CardPlayer | null {
  const p = view.picks.find((x) => x.playerId === id);
  if (!p) return null;
  const pct = players?.find((x) => x.id === id)?.selectedPct ?? null;
  return { id, firstName: p.firstName, lastName: p.lastName, position: p.position, clubId: p.clubId, price: p.price, selectedPct: pct };
}

function Message({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const th = useTheme();
  const t = useT();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
      <span style={{ fontWeight: 700, color: th.muted }}>{text}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ height: 44, padding: '0 20px', borderRadius: 16, border: 0, background: th.primary, color: '#FFFFFF', fontWeight: 800, boxShadow: `0 3px 0 ${th.lip}`, cursor: 'pointer' }}>
          {t('retry')}
        </button>
      )}
    </div>
  );
}

function Splash({ boot, onRetry }: { boot: Boot; onRetry: () => void }) {
  const th = useTheme();
  const t = useT();
  const text = boot.state === 'outside' ? t('openInTelegram') : boot.state === 'error' ? t('loginFailed') : t('loading');
  return (
    <div style={{ minHeight: '100vh', background: th.bg, color: th.ink, display: 'flex', flexDirection: 'column' }}>
      <Header />
      <Message text={text} onRetry={boot.state === 'error' ? onRetry : undefined} />
    </div>
  );
}
