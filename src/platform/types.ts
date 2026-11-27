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
}
