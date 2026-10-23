// Команда атауы: жалпы рейтингте Telegram аты емес, осы атау көрінеді (3–24 таңба).
import { useState } from 'react';
import type { Api } from '../api.js';
import { Sheet } from '../components/Sheet.js';
import { useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { FONT_NUM } from '../theme/tokens.js';

export function TeamNameSheet({ api, initial, onSaved, onClose }: { api: Pick<Api, 'saveProfile'>; initial: string | null; onSaved: (name: string) => void; onClose?: () => void }) {
  const t = useTheme();
  const tr = useT();
  const [value, setValue] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const name = value.trim();
  const valid = [...name].length >= 3 && [...name].length <= 24;

  async function save() {
    setBusy(true);
    setError(false);
    const r = await api.saveProfile({ teamName: name });
    setBusy(false);
    if (r.ok) onSaved(name);
    else setError(true);
  }

  // Атауы жоқ болса, терезе жабылмайды: рейтингке атау керек
  return (
    <Sheet open onClose={onClose ?? (() => {})} label={tr('teamName')}>
      <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label htmlFor="team-name" style={{ fontFamily: FONT_NUM, fontWeight: 800, fontSize: 22 }}>{tr('teamName')}</label>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.muted }}>{tr('teamNameHint')}</p>
        <input id="team-name" value={value} maxLength={24} autoComplete="off" onChange={(e) => setValue(e.target.value)}
          style={{ height: 48, borderRadius: 16, border: 0, background: t.card2, boxShadow: `inset 0 -2px 0 ${t.tileLip}`, padding: '0 14px', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, color: t.ink }} />
        {error && <span role="alert" style={{ fontSize: 13, fontWeight: 800, color: t.hard[1] }}>{tr('errorGeneric')}</span>}
        <button type="button" onClick={save} disabled={!valid || busy}
          style={{ height: 50, borderRadius: 17, border: 0, background: t.primary, color: '#FFFFFF', boxShadow: `0 4px 0 ${t.lip}`, fontFamily: FONT_NUM, fontWeight: 800, fontSize: 16, cursor: 'pointer', opacity: !valid || busy ? 0.5 : 1 }}>
          {tr('save')}
        </button>
      </div>
    </Sheet>
  );
}
