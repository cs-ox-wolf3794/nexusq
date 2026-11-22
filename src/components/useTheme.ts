import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useTheme(): { mode: ThemeMode; toggle: () => void } {
  const [mode, setMode] = useState<ThemeMode>(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("nexusq-theme"); } catch { /* Use the system preference when storage is blocked. */ }
    if (saved === "light" || saved === "dark") return saved;
    return systemPrefersDark() ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    try { localStorage.setItem("nexusq-theme", mode); } catch { /* Theme still applies for this session. */ }
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === "dark" ? "light" : "dark")), []);
  return { mode, toggle };
}

/** Read the current values of CSS custom properties (post data-theme stamp). */
export function readTokens(names: string[]): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const n of names) out[n] = cs.getPropertyValue(n).trim();
  return out;
}
