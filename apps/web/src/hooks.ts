// Жалпы хуктар
import { useEffect, useRef } from 'react';

// Қосулы кезде fn-ды әр ms сайын шақырады (тур жүріп жатқанда ұпайларды жаңарту)
export function useAutoRefresh(enabled: boolean, fn: () => void, ms: number): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [enabled, ms]);
}
