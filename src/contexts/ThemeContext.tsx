"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_THEME_KEY, THEME_PRESETS, type TextZoom } from "@/lib/theme-presets";

interface ThemeContextValue {
  themeKey: string;
  setThemeKey: (key: string) => void;
  dark: boolean;
  setDark: (dark: boolean) => void;
  textZoom: TextZoom;
  setTextZoom: (zoom: TextZoom) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "aoehub.theme";

interface StoredTheme {
  themeKey: string;
  dark: boolean;
  textZoom: TextZoom;
}

const CSS_VAR_NAMES = ["--bg", "--card", "--text", "--text-secondary", "--text-muted", "--border", "--accent", "--accent-text"] as const;

function applyThemeToDom(themeKey: string, dark: boolean) {
  const root = document.getElementById("app-root");
  if (!root) return;
  root.classList.toggle("dark", dark);

  const preset = THEME_PRESETS[themeKey];
  if (themeKey === DEFAULT_THEME_KEY || !preset) {
    CSS_VAR_NAMES.forEach((name) => root.style.removeProperty(name));
    root.style.removeProperty("font-family");
    return;
  }
  const palette = dark ? preset.dark : preset.light;
  root.style.setProperty("--bg", palette.bg);
  root.style.setProperty("--card", palette.card);
  root.style.setProperty("--text", palette.text);
  root.style.setProperty("--text-secondary", palette.textSecondary);
  root.style.setProperty("--text-muted", palette.textMuted);
  root.style.setProperty("--border", palette.border);
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--accent-text", palette.accentText);
  root.style.fontFamily = preset.font;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKeyState] = useState(DEFAULT_THEME_KEY);
  const [dark, setDarkState] = useState(false);
  const [textZoom, setTextZoomState] = useState<TextZoom>(1);

  // Persisted preferences live client-side only, so they can't be read
  // until after mount (avoids an SSR/client markup mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as StoredTheme;
        /* eslint-disable react-hooks/set-state-in-effect */
        setThemeKeyState(stored.themeKey ?? DEFAULT_THEME_KEY);
        setDarkState(Boolean(stored.dark));
        setTextZoomState(stored.textZoom ?? 1);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    applyThemeToDom(themeKey, dark);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ themeKey, dark, textZoom }));
  }, [themeKey, dark, textZoom]);

  function setThemeKey(key: string) {
    setThemeKeyState(key);
  }
  function setDark(next: boolean) {
    setDarkState(next);
  }
  function setTextZoom(zoom: TextZoom) {
    setTextZoomState(zoom);
  }

  const value = useMemo(
    () => ({ themeKey, setThemeKey, dark, setDark, textZoom, setTextZoom }),
    [themeKey, dark, textZoom]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
