// Тема Telegram-нан алынады (colorScheme) және themeChanged оқиғасымен бірден ауысады.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { tg } from '../telegram.js';
import { DARK, LIGHT, type Tokens } from './tokens.js';

const ThemeContext = createContext<Tokens>(LIGHT);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setScheme] = useState(() => tg().colorScheme);
  useEffect(() => tg().onTheme(() => setScheme(tg().colorScheme)), []);
  const tokens = scheme === 'dark' ? DARK : LIGHT;
  useEffect(() => {
    document.body.style.background = tokens.bg;
    document.body.style.color = tokens.ink;
    tg().setColors(tokens.bg);
  }, [tokens]);
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Tokens {
  return useContext(ThemeContext);
}
