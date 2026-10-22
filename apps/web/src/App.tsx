// Қосымша: тема, тіл, Telegram арқылы кіру, деректерді жүктеу және экрандар арасында ауысу.
import { useCallback, useEffect, useState } from 'react';
import { api, type ClubRow, type Session, type TeamView } from './api.js';
import { BottomNav, type Tab } from './components/BottomNav.js';
import { Header } from './components/Header.js';
import { LangProvider, detectLang, useT, type Lang } from './i18n/useT.js';
import { Team } from './screens/Team.js';
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
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([api.teamView(), api.clubs()]).then(
      ([view, clubs]) => setData({ view, clubs: new Map(clubs.map((c) => [c.id, c])) }),
      () => setFailed(true)
    );
  }, []);
  useEffect(load, [load]);

  let screen;
  if (failed) screen = <Message text={t('errorGeneric')} onRetry={load} />;
  else if (!data) screen = <Message text={t('loading')} />;
  else if (tab === 'team') screen = <Team view={data.view} clubs={data.clubs} api={api} onPlayer={() => {}} onChanged={load} />;
  else screen = <Message text={t('loading')} />;

  return (
    <div style={{ minHeight: '100vh', height: '100vh', maxWidth: 480, margin: '0 auto', background: th.bg, color: th.ink, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header />
      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>{screen}</main>
      <BottomNav current={tab} onNavigate={setTab} />
    </div>
  );
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
