import React, { createContext, useContext, useMemo, useState } from 'react';
import { THEMES, ThemeKey, Theme } from './themes';

interface ThemeContextValue {
  themeKey: ThemeKey;
  theme: Theme;
  setThemeKey: (key: ThemeKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DEFAULT_THEME: ThemeKey = 'paper';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKey] = useState<ThemeKey>(DEFAULT_THEME);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeKey, theme: THEMES[themeKey], setThemeKey }),
    [themeKey]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
