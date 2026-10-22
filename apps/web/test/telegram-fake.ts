// Telegram.WebApp бітемесі: тема, тіл, initData, оқиғалар
export function fakeTelegram(opts: { colorScheme?: 'light' | 'dark'; languageCode?: string; initData?: string } = {}) {
  const handlers = new Map<string, (() => void)[]>();
  const haptics: string[] = [];
  const webApp = {
    initData: opts.initData ?? 'query_id=1&hash=abc',
    initDataUnsafe: { user: opts.languageCode === undefined ? { id: 1 } : { id: 1, language_code: opts.languageCode } },
    colorScheme: opts.colorScheme ?? 'light',
    ready() {},
    expand() {},
    setHeaderColor() {},
    setBackgroundColor() {},
    onEvent(name: string, cb: () => void) {
      handlers.set(name, [...(handlers.get(name) ?? []), cb]);
    },
    offEvent(name: string, cb: () => void) {
      handlers.set(name, (handlers.get(name) ?? []).filter((h) => h !== cb));
    },
    HapticFeedback: {
      impactOccurred: (s: string) => haptics.push(s),
      notificationOccurred: (s: string) => haptics.push(s)
    }
  };
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };
  return {
    webApp,
    haptics,
    setScheme(s: 'light' | 'dark') {
      webApp.colorScheme = s;
      for (const h of handlers.get('themeChanged') ?? []) h();
    }
  };
}
