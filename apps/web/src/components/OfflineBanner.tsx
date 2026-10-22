// Интернет жоқ кезде жоғарғы жолақ
import { useEffect, useState } from 'react';
import { useT } from '../i18n/useT.js';
import { useTheme } from '../theme/ThemeProvider.js';

export function OfflineBanner() {
  const t = useTheme();
  const tr = useT();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" style={{ margin: '6px 16px 0', padding: '8px 12px', borderRadius: 14, background: t.hard[0], color: t.hard[1], fontSize: 12, fontWeight: 800, textAlign: 'center' }}>
      {tr('offline')}
    </div>
  );
}
