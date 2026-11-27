// Owlbear Rodeo implementation. APIs checked against docs.owlbear.rodeo/extensions
// (OBR.onReady/isReady, player.getRole/getName, theme.getTheme/onChange, notification.show,
// action.setBadgeText/setBadgeBackgroundColor).
import OBR, { type Theme } from "@owlbear-rodeo/sdk";
import type { AppTheme, NotifyVariant, Platform, Role, RollMessage } from "./types";

/** Broadcast channel for rolls (docs: OBR.broadcast, 16 KB limit, destination REMOTE). */
export const ROLL_CHANNEL = "com.krunklewitz.nimble-bear/roll";

const isRollMessage = (d: unknown): d is RollMessage =>
  typeof d === "object" && d !== null && (d as RollMessage).v === 1 && typeof (d as RollMessage).label === "string" && Array.isArray((d as RollMessage).detail);

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
  let role: Role = "PLAYER";
  return {
    host: "owlbear",
    ready: () =>
      new Promise<void>((resolve) => {
        if (OBR.isReady) resolve();
        else OBR.onReady(() => resolve());
      }),
    getRole: async (): Promise<Role> => (role = await OBR.player.getRole()),
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
    sendRoll: async (message: RollMessage) => {
      if (message.privacy === "self") return;
      await OBR.broadcast.sendMessage(ROLL_CHANNEL, message, { destination: "REMOTE" });
    },
    onRoll: (callback) =>
      OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => {
        if (!isRollMessage(event.data)) return;
        // GM-only rolls reach every client (broadcast can't target one player); non-GMs ignore them.
        if (event.data.privacy === "gm" && role !== "GM") return;
        if (event.data.privacy === "self") return;
        callback(event.data);
      }),
  };
}

export const isInOwlbear = (): boolean => OBR.isAvailable;
