"use client";

import * as React from "react";

/**
 * Minimal cookie-based theme system (next-themes replacement).
 *
 * Kyun? React 19.3 me next-themes / next-script ke inline <script> se dev-overlay
 * console error aata tha. Ab flow ye hai:
 *   - Explicit choice → "bloom_theme" cookie → root layout SSR par <html> par class
 *   - System default → koi class nahi, globals.css me media-query dark tokens
 *   - Toggle → class + cookie dono update (no flash, no script)
 *
 * API next-themes jaisi hi: const { theme, resolvedTheme, setTheme } = useTheme();
 */

export const THEME_COOKIE = "bloom_theme";

const ThemeContext = React.createContext(null);

function readThemeCookie() {
  try {
    const match = document.cookie.match(/(?:^|; )bloom_theme=(light|dark|system)(?:;|$)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function writeThemeCookie(value) {
  try {
    document.cookie = `bloom_theme=${value}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // private mode — session-only theme
  }
}

export function ThemeProvider({ children, defaultTheme = "system" }) {
  const [theme, setThemeState] = React.useState(defaultTheme);
  const [systemTheme, setSystemTheme] = React.useState("light");

  // Cookie se init + system preference tracking (setTimeout pattern — lint-safe)
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const t = window.setTimeout(() => {
      setSystemTheme(mq.matches ? "dark" : "light");
      const stored = readThemeCookie();
      if (stored) setThemeState(stored);
    }, 0);
    const onSystemChange = (e) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", onSystemChange);
    return () => {
      window.clearTimeout(t);
      mq.removeEventListener("change", onSystemChange);
    };
  }, []);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  // Class sync — SSR cookie se class laga chuka hoga, ye nav/mutation ke baad re-sync hai.
  // system theme → dono classes hatao (globals.css media-query sambhal leta hai).
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (theme !== "system") root.classList.add(theme);
    root.style.colorScheme = resolvedTheme;
  }, [theme, resolvedTheme]);

  const setTheme = React.useCallback((next) => {
    setThemeState(next);
    writeThemeCookie(next);
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
