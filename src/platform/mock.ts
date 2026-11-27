// Stand-in used when the site is opened in a normal browser tab (development,
// tests, and the pop-out fallback). No Owlbear calls.
import type { AppTheme, Platform, Role } from "./types";

export const DARK_THEME: AppTheme = {
  mode: "DARK",
  background: "#1e2231",
  paper: "#2b3044",
  text: "#ffffff",
  textSecondary: "#b8bdd1",
  primary: "#bb99ff",
  primaryContrast: "#1e2231",
};

export const LIGHT_THEME: AppTheme = {
  mode: "LIGHT",
  background: "#f4f4f7",
  paper: "#ffffff",
  text: "#1e2231",
  textSecondary: "#4b5068",
  primary: "#6a40c4",
  primaryContrast: "#ffffff",
};

export interface MockOptions {
  role?: Role;
  playerName?: string;
  theme?: AppTheme;
}

function systemTheme(): AppTheme {
  const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  return dark ? DARK_THEME : LIGHT_THEME;
}

export function createMockPlatform(options: MockOptions = {}): Platform {
  const notices: string[] = [];
  return {
    host: "standalone",
    ready: async () => undefined,
    getRole: async () => options.role ?? "PLAYER",
    getPlayerName: async () => options.playerName ?? "Test Player",
    getTheme: async () => options.theme ?? systemTheme(),
    onThemeChange: () => () => undefined,
    notify: async (message) => {
      notices.push(message);
      console.info(`[notification] ${message}`);
    },
  };
}
