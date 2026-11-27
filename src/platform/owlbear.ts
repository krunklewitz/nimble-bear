// Owlbear Rodeo implementation. APIs checked against docs.owlbear.rodeo/extensions
// (OBR.onReady/isReady, player.getRole/getName, theme.getTheme/onChange, notification.show,
// action.setBadgeText/setBadgeBackgroundColor).
import OBR, { type Theme } from "@owlbear-rodeo/sdk";
import type { AppTheme, NotifyVariant, Platform, Role } from "./types";

function toAppTheme(theme: Theme): AppTheme {
  return {
    mode: theme.mode,
    background: theme.background.default,
    paper: theme.background.paper,
    text: theme.text.primary,
    textSecondary: theme.text.secondary,
    primary: theme.primary.main,
    primaryContrast: theme.primary.contrastText,
  };
}

export function createOwlbearPlatform(): Platform {
  return {
    host: "owlbear",
    ready: () =>
      new Promise<void>((resolve) => {
        if (OBR.isReady) resolve();
        else OBR.onReady(() => resolve());
      }),
    getRole: async (): Promise<Role> => OBR.player.getRole(),
    getPlayerName: () => OBR.player.getName(),
    getTheme: async () => toAppTheme(await OBR.theme.getTheme()),
    onThemeChange: (callback) => OBR.theme.onChange((theme) => callback(toAppTheme(theme))),
    notify: async (message: string, variant?: NotifyVariant) => {
      await OBR.notification.show(message, variant);
    },
    setUnsavedBadge: async (unsaved: boolean) => {
      // Badge text undefined removes the badge (docs: action.setBadgeText).
      if (unsaved) {
        await OBR.action.setBadgeBackgroundColor("#d4a72c");
        await OBR.action.setBadgeText("!");
      } else {
        await OBR.action.setBadgeText(undefined);
      }
    },
  };
}

export const isInOwlbear = (): boolean => OBR.isAvailable;
