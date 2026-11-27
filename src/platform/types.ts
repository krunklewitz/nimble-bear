// The app's view of its host. Only files in src/platform/ implement this.

export type Host = "owlbear" | "standalone";
export type Role = "GM" | "PLAYER";
export type NotifyVariant = "DEFAULT" | "ERROR" | "INFO" | "SUCCESS" | "WARNING";

/** Colors the UI uses, taken from Owlbear's theme when embedded. */
export interface AppTheme {
  mode: "DARK" | "LIGHT";
  background: string;
  paper: string;
  text: string;
  textSecondary: string;
  primary: string;
  primaryContrast: string;
}

/** A roll shared with the room (kept well under Owlbear's 16 KB broadcast limit). */
export interface RollMessage {
  v: 1;
  id: string;
  character: string;
  player: string;
  label: string;
  /** e.g. "1d8+2 → 7" */
  summary: string;
  total: number;
  /** Full breakdown, one line per part. */
  detail: string[];
  crit: boolean;
  miss: boolean;
  privacy: "public" | "gm" | "self";
  at: string;
}

export interface Platform {
  readonly host: Host;
  /** Resolves once the host is ready to talk to. */
  ready(): Promise<void>;
  getRole(): Promise<Role>;
  getPlayerName(): Promise<string>;
  getTheme(): Promise<AppTheme>;
  /** Returns an unsubscribe function. */
  onThemeChange(callback: (theme: AppTheme) => void): () => void;
  notify(message: string, variant?: NotifyVariant): Promise<void>;
  /** Shows or clears a marker on the extension icon (Owlbear action badge). */
  setUnsavedBadge(unsaved: boolean): Promise<void>;
  /** Sends a roll to other players (public, or GM only). "self" rolls are never sent. */
  sendRoll(message: RollMessage): Promise<void>;
  /** Rolls from other players that this player may see. Returns an unsubscribe function. */
  onRoll(callback: (message: RollMessage) => void): () => void;
}
