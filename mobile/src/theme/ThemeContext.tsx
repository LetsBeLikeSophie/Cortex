import React, { createContext, useContext, useMemo, useState } from 'react';
import { LayoutKey, PaletteKey, Theme, composeTheme } from './themes';

interface ThemeContextValue {
  layoutKey: LayoutKey;
  paletteKey: PaletteKey;
  theme: Theme;
  setLayoutKey: (key: LayoutKey) => void;
  setPaletteKey: (key: PaletteKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DEFAULT_LAYOUT: LayoutKey = 'line';
const DEFAULT_PALETTE: PaletteKey = 'paper';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [layoutKey, setLayoutKey] = useState<LayoutKey>(DEFAULT_LAYOUT);
  const [paletteKey, setPaletteKey] = useState<PaletteKey>(DEFAULT_PALETTE);

  const value = useMemo<ThemeContextValue>(
    () => ({ layoutKey, paletteKey, theme: composeTheme(layoutKey, paletteKey), setLayoutKey, setPaletteKey }),
    [layoutKey, paletteKey]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
