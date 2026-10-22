// Telegram.WebApp орамы; Telegram-нан тыс (әзірлеушінің браузері) — бітеме, initData ортадан.

interface WebApp {
  initData: string;
  initDataUnsafe?: { user?: { language_code?: string }; start_param?: string };
  colorScheme: 'light' | 'dark';
  ready?(): void;
  expand?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent?(name: string, cb: () => void): void;
  offEvent?(name: string, cb: () => void): void;
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
}

export interface Tg {
  inTelegram: boolean;
  initData: string;
  colorScheme: 'light' | 'dark';
  languageCode: string | null;
  haptic(type: 'light' | 'success' | 'error'): void;
  // Жазылудан бас тарту функциясын қайтарады
  onTheme(cb: () => void): () => void;
  setColors(bg: string): void;
}

function webApp(): WebApp | null {
  const w = (globalThis as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
  return w && typeof w.initData === 'string' && w.initData !== '' ? w : null;
}

export function tg(): Tg {
  const w = webApp();
  if (!w) {
    return {
      inTelegram: false,
      initData: (import.meta.env?.VITE_DEV_INIT_DATA as string | undefined) ?? '',
      colorScheme: 'light',
      languageCode: null,
      haptic: () => {},
      onTheme: () => () => {},
      setColors: () => {}
    };
  }
  return {
    inTelegram: true,
    initData: w.initData,
    colorScheme: w.colorScheme === 'dark' ? 'dark' : 'light',
    languageCode: w.initDataUnsafe?.user?.language_code ?? null,
    haptic(type) {
      if (type === 'light') w.HapticFeedback?.impactOccurred('light');
      else w.HapticFeedback?.notificationOccurred(type);
    },
    onTheme(cb) {
      w.onEvent?.('themeChanged', cb);
      return () => w.offEvent?.('themeChanged', cb);
    },
    setColors(bg) {
      w.setHeaderColor?.(bg);
      w.setBackgroundColor?.(bg);
    }
  };
}
