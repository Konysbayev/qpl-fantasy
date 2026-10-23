// Профиль: тіл (қазақша / орысша), боттағы хабарламалар, тема Telegram-дағыдай, бейресми ойын туралы ескерту.
import { useState } from 'react';
import type { Api } from '../api.js';
import { Sheet } from '../components/Sheet.js';
import { useT, type Lang } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

// Тіл атауы әрқашан өз тілінде
const LANGS: [Lang, string][] = [['kk', 'Қазақша'], ['ru', 'Русский']];

export interface ProfileProps {
  name: string;
  lang: Lang;
  notify: boolean;
  onNotify: (v: boolean) => void;
  api: Pick<Api, 'saveProfile'>;
  onLang: (l: Lang) => void;
  onClose: () => void;
}

export function Profile({ name, lang, notify, onNotify, api, onLang, onClose }: ProfileProps) {
  const t = useTheme();
  const tr = useT();
  const [error, setError] = useState(false);

  // Тіл серверге де жазылады: хабарламалар таңдалған тілде келеді
  const chooseLang = (code: Lang) => {
    onLang(code);
    void api.saveProfile({ lang: code });
  };
  // Ауыстырғыш бірден ауысады; сервер бас тартса — қайтады
  async function toggleNotify() {
    const next = !notify;
    setError(false);
    onNotify(next);
    const r = await api.saveProfile({ notify: next });
    if (!r.ok) {
      onNotify(!next);
      setError(true);
    }
  }
  const label = { fontSize: 12, fontWeight: 800, color: t.muted, letterSpacing: '0.04em', textTransform: 'uppercase' } as const;
  return (
    <Sheet open onClose={onClose} label={tr('profile')}>
      <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 style={{ margin: 0, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 24 }}>{name}</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={label}>{tr('language')}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {LANGS.map(([code, title]) => {
              const on = code === lang;
              return (
                <button key={code} type="button" aria-pressed={on} onClick={() => chooseLang(code)}
                  style={{ height: 48, borderRadius: 16, border: 0, background: on ? t.primary : t.card2, color: on ? '#FFFFFF' : t.ink, boxShadow: on ? `0 3px 0 ${t.lip}` : `inset 0 -2px 0 ${t.tileLip}`, fontFamily: FONT_NUM, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                  {title}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" role="switch" aria-checked={notify} onClick={toggleNotify}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, padding: '0 14px', borderRadius: 16, border: 0, background: t.card2, color: t.ink, boxShadow: `inset 0 -2px 0 ${t.tileLip}`, fontFamily: FONT_NUM, fontWeight: 700, fontSize: 15, cursor: 'pointer', textAlign: 'left' }}>
            <span>{tr('notifications')}</span>
            <span aria-hidden="true" style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 13, background: notify ? t.primary : t.line, position: 'relative', transition: 'background 0.15s' }}>
              <span style={{ position: 'absolute', top: 3, left: notify ? 21 : 3, width: 20, height: 20, borderRadius: 10, background: '#FFFFFF', transition: 'left 0.15s' }} />
            </span>
          </button>
          {error && <span role="alert" style={{ fontSize: 13, fontWeight: 800, color: t.hard[1] }}>{tr('errorGeneric')}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={label}>{tr('theme')}</span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{tr('themeTelegram')}</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: t.muted }}>{tr('unofficial')}</p>
      </div>
    </Sheet>
  );
}
