// Профиль: тіл (қазақша / орысша), тема Telegram-дағыдай, бейресми ойын туралы ескерту.
import { Sheet } from '../components/Sheet.js';
import { useT, type Lang } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

// Тіл атауы әрқашан өз тілінде
const LANGS: [Lang, string][] = [['kk', 'Қазақша'], ['ru', 'Русский']];

export function Profile({ name, lang, onLang, onClose }: { name: string; lang: Lang; onLang: (l: Lang) => void; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
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
                <button key={code} type="button" aria-pressed={on} onClick={() => onLang(code)}
                  style={{ height: 48, borderRadius: 16, border: 0, background: on ? t.primary : t.card2, color: on ? '#FFFFFF' : t.ink, boxShadow: on ? `0 3px 0 ${t.lip}` : `inset 0 -2px 0 ${t.tileLip}`, fontFamily: FONT_NUM, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                  {title}
                </button>
              );
            })}
          </div>
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
