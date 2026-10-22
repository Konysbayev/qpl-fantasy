// Қосымшаның қаңқасы: тема, тіл, Telegram арқылы кіру. Экрандар келесі тапсырмаларда қосылады.
import { useEffect, useState } from 'react';
import { api, type Session } from './api.js';
import { LangProvider, detectLang, useT, type Lang } from './i18n/useT.js';
import { tg } from './telegram.js';
import { ThemeProvider, useTheme } from './theme/ThemeProvider.js';
import { FONT_NUM } from './theme/tokens.js';

type Boot = { state: 'loading' } | { state: 'outside' } | { state: 'error' } | { state: 'ready'; session: Session };

export function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang(tg().languageCode));
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const login = () => {
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
  };
  useEffect(login, []);

  return (
    <ThemeProvider>
      <LangProvider lang={lang}>
        <Shell boot={boot} onRetry={login} />
      </LangProvider>
    </ThemeProvider>
  );
}

function Shell({ boot, onRetry }: { boot: Boot; onRetry: () => void }) {
  const t = useT();
  const th = useTheme();
  const message = boot.state === 'loading' ? t('loading') : boot.state === 'outside' ? t('openInTelegram') : boot.state === 'error' ? t('loginFailed') : null;
  return (
    <main style={{ minHeight: '100vh', background: th.bg, color: th.ink, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
      <span style={{ fontFamily: FONT_NUM, fontWeight: 900, fontSize: 25 }}>
        <span style={{ color: th.primaryText }}>QPL</span> Fantasy
      </span>
      {message && <span style={{ fontWeight: 700, color: th.muted }}>{message}</span>}
      {boot.state === 'error' && (
        <button onClick={onRetry} style={{ height: 44, padding: '0 20px', borderRadius: 16, border: 0, background: th.primary, color: '#FFFFFF', fontWeight: 800, boxShadow: `0 3px 0 ${th.lip}` }}>
          {t('retry')}
        </button>
      )}
    </main>
  );
}
