import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppTheme, Platform, Role } from "../platform";

interface PlatformState {
  platform: Platform;
  ready: boolean;
  role: Role;
  theme: AppTheme | null;
}

const Ctx = createContext<PlatformState | null>(null);

function applyTheme(theme: AppTheme) {
  const s = document.documentElement.style;
  s.setProperty("--bg", theme.background);
  s.setProperty("--paper", theme.paper);
  s.setProperty("--text", theme.text);
  s.setProperty("--text-2", theme.textSecondary);
  s.setProperty("--primary", theme.primary);
  s.setProperty("--primary-contrast", theme.primaryContrast);
  document.documentElement.dataset["mode"] = theme.mode.toLowerCase();
}

export function PlatformProvider({ platform, children }: { platform: Platform; children: ReactNode }) {
  const [state, setState] = useState<PlatformState>({ platform, ready: false, role: "PLAYER", theme: null });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      document.documentElement.dataset["host"] = platform.host;
      await platform.ready();
      const [role, theme] = await Promise.all([platform.getRole(), platform.getTheme()]);
      if (cancelled) return;
      applyTheme(theme);
      setState({ platform, ready: true, role, theme });
      unsubscribe = platform.onThemeChange((t) => {
        applyTheme(t);
        setState((prev) => ({ ...prev, theme: t }));
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [platform]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function usePlatform(): PlatformState {
  const value = useContext(Ctx);
  if (!value) throw new Error("usePlatform must be used inside PlatformProvider");
  return value;
}
