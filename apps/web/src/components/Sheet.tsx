// Төменнен шығатын парақ (ойыншы картасы т.б.): «Жабу» батырмасы, Escape және жоғарғы бөлікті төмен сырғыту жабады.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { ICONS } from './shapes.js';

// Осыдан ұзақ төмен сырғытса — жабылады
const CLOSE_DRAG = 80;

export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const t = useTheme();
  const tr = useT();
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const end = () => {
    if (start.current !== null && drag > CLOSE_DRAG) onClose();
    start.current = null;
    setDrag(0);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <div aria-hidden="true" onClick={onClose} style={{ position: 'absolute', inset: 0, background: t.scrim }} />
      <section role="dialog" aria-modal="true" aria-label={label}
        style={{ position: 'absolute', left: 0, right: 0, top: 64, bottom: 0, maxWidth: 480, margin: '0 auto', background: t.card, color: t.ink, borderRadius: '28px 28px 0 0', boxShadow: '0 -10px 30px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column', transform: `translateY(${drag}px)`, transition: start.current === null ? 'transform 0.2s' : 'none' }}>
        <div data-testid="sheet-grip" style={{ position: 'relative', height: 48, flexShrink: 0, touchAction: 'none' }}
          onPointerDown={(e) => {
            start.current = e.clientY;
          }}
          onPointerMove={(e) => {
            if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current));
          }}
          onPointerUp={end}
          onPointerCancel={end}>
          <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: 10, width: 40, height: 5, marginLeft: -20, borderRadius: 3, background: t.sheetLine }} />
          <button type="button" aria-label={tr('close')} onClick={onClose}
            style={{ position: 'absolute', right: 14, top: 8, width: 44, height: 44, borderRadius: 15, border: 0, background: t.card2, boxShadow: `inset 0 -2px 0 ${t.tileLip}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d={ICONS.close} fill="none" stroke={t.ink} strokeWidth={2.6} strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
      </section>
    </div>
  );
}
