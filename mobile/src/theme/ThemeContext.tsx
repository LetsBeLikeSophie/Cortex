import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAYOUTS, LayoutKey, PALETTES, PaletteKey, Theme, composeTheme } from './themes';

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
const STORAGE_KEY = 'cortex.theme';

// The chosen theme is remembered on the device. Children aren't rendered
// until it's been read back (onReady lets App keep the splash screen up
// until then), so a vintage user never sees a flash of the line theme.
export function ThemeProvider({ children, onReady }: { children: React.ReactNode; onReady?: () => void }) {
  const [layoutKey, setLayout] = useState<LayoutKey>(DEFAULT_LAYOUT);
  const [paletteKey, setPalette] = useState<PaletteKey>(DEFAULT_PALETTE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as { layout?: string; palette?: string }) : null;
        if (saved?.layout && saved.layout in LAYOUTS) setLayout(saved.layout as LayoutKey);
        if (saved?.palette && saved.palette in PALETTES) setPalette(saved.palette as PaletteKey);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  const persist = (layout: LayoutKey, palette: PaletteKey) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ layout, palette })).catch(() => {});
  };

  // A layout arrives with its signature color; the palette row can still
  // override it afterwards.
  const setLayoutKey = (key: LayoutKey) => {
    setLayout(key);
    setPalette(LAYOUTS[key].signature);
    persist(key, LAYOUTS[key].signature);
  };
  const setPaletteKey = (key: PaletteKey) => {
    setPalette(key);
    persist(layoutKey, key);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({ layoutKey, paletteKey, theme: composeTheme(layoutKey, paletteKey), setLayoutKey, setPaletteKey }),
    [layoutKey, paletteKey]
  );

  if (!ready) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
