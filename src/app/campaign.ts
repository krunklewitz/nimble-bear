// The GM's campaign: glue between pure rules (src/rules/persistence/campaign.ts,
// src/rules/tracker.ts) and storage. No React. Every change autosaves to this device;
// the campaign file is the durable copy (same idea as character files, DESIGN.md §5.3).
import { checksumOf, type Hasher } from "../rules/persistence/canonical";
import { buildCampaignFile, campaignFileName, CampaignSchema, newCampaign, parseCampaignFile, type Campaign, type Monster } from "../rules/persistence/campaign";
import type { CharacterStore } from "../platform/storage/types";

const KEY = "campaign";
/** The copy before the last load or reset, so a mistaken load can be undone. */
const PREVIOUS_KEY = "campaign:previous";
const SAVED_KEY = "campaign:lastSavedChecksum";
export const CAMPAIGN_UNDO_STEPS = 50;

export interface CampaignDeps {
  store: CharacterStore;
  hash: Hasher;
  now: () => Date;
  newId: () => string;
  appVersion: string;
  dateStamp: () => string;
}

export type CampaignImport =
  | { kind: "invalid"; error: string }
  | { kind: "campaign"; campaign: Campaign; checksum: string; checksumMatches: boolean; savedAt: string | null; localUnsaved: boolean }
  | { kind: "monsters"; monsters: Monster[]; added: number; replaced: number };

export class CampaignBook {
  private campaign: Campaign;
  private checksum: string | null = null;
  private lastSaved: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly undo: { label: string; campaign: Campaign }[] = [];
  private version = 0;
  private writing: Promise<void> = Promise.resolve();
  /** Set when the stored campaign couldn't be read; it is kept, untouched, as campaign:previous. */
  loadError: string | null = null;

  private constructor(
    private readonly deps: CampaignDeps,
    campaign: Campaign,
  ) {
    this.campaign = campaign;
  }

  static async open(deps: CampaignDeps): Promise<CampaignBook> {
    const raw = await deps.store.getSetting(KEY);
    let campaign: Campaign | null = null;
    let loadError: string | null = null;
    if (raw !== undefined) {
      try {
        const parsed = CampaignSchema.safeParse(JSON.parse(raw));
        if (parsed.success) campaign = parsed.data;
        else loadError = "The saved campaign on this device couldn't be read; a backup was kept.";
      } catch {
        loadError = "The saved campaign on this device couldn't be read; a backup was kept.";
      }
      // Never lose unreadable data: keep it as the previous copy before starting fresh.
      if (!campaign) await deps.store.putSetting(PREVIOUS_KEY, raw);
    }
    const book = new CampaignBook(deps, campaign ?? newCampaign(deps.newId(), deps.now().toISOString()));
    book.loadError = loadError;
    book.lastSaved = (await deps.store.getSetting(SAVED_KEY)) ?? null;
    book.checksum = await checksumOf(book.campaign, deps.hash);
    if (!campaign) await book.persist();
    return book;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = (): number => this.version;
  get(): Campaign {
    return this.campaign;
  }
  newId(): string {
    return this.deps.newId();
  }

  /** True when there are changes since the campaign file was last saved. */
  isUnsaved(): boolean {
    return this.checksum === null || this.checksum !== this.lastSaved;
  }
  canUndo(): string | null {
    return this.undo.at(-1)?.label ?? null;
  }

  private changed() {
    this.version += 1;
    for (const l of this.listeners) l();
  }

  private async persist(): Promise<void> {
    const snapshot = this.campaign;
    this.writing = this.writing.then(async () => {
      await this.deps.store.putSetting(KEY, JSON.stringify(snapshot));
    });
    await this.writing;
    this.checksum = await checksumOf(snapshot, this.deps.hash);
    this.changed();
  }

  /** Applies a change to a copy, validates it, and autosaves. Throws (and changes nothing) if invalid. */
  async update(label: string, change: (draft: Campaign) => void): Promise<void> {
    const draft = structuredClone(this.campaign);
    change(draft);
    draft.revision = this.campaign.revision + 1;
    draft.updatedAt = this.deps.now().toISOString();
    const checked = CampaignSchema.parse(draft);
    this.undo.push({ label, campaign: this.campaign });
    if (this.undo.length > CAMPAIGN_UNDO_STEPS) this.undo.shift();
    this.campaign = checked;
    this.checksum = null;
    this.changed();
    await this.persist();
  }

  async undoLast(): Promise<void> {
    const prev = this.undo.pop();
    if (!prev) return;
    this.campaign = { ...prev.campaign, revision: this.campaign.revision + 1, updatedAt: this.deps.now().toISOString() };
    await this.persist();
  }

  /** The campaign file's text and name. Call markSaved once it's downloaded. */
  async buildFile(): Promise<{ text: string; fileName: string; checksum: string }> {
    const { text, checksum } = await buildCampaignFile(this.campaign, this.deps.appVersion, this.deps.now().toISOString(), this.deps.hash);
    return { text, checksum, fileName: campaignFileName(this.campaign, this.deps.dateStamp()) };
  }

  async markSaved(checksum: string): Promise<void> {
    this.lastSaved = checksum;
    await this.deps.store.putSetting(SAVED_KEY, checksum);
    this.changed();
  }

  /** Reads a campaign or monster file without changing anything. */
  async prepareImport(text: string): Promise<CampaignImport> {
    const parsed = await parseCampaignFile(text, this.deps.hash);
    if (!parsed.ok) return { kind: "invalid", error: parsed.error };
    if (parsed.kind === "monsters") {
      const ids = new Set(this.campaign.monsters.map((m) => m.id));
      const replaced = parsed.monsters.filter((m) => ids.has(m.id)).length;
      return { kind: "monsters", monsters: parsed.monsters, added: parsed.monsters.length - replaced, replaced };
    }
    return { kind: "campaign", campaign: parsed.campaign, checksum: parsed.checksum, checksumMatches: parsed.checksumMatches, savedAt: parsed.savedAt, localUnsaved: this.isUnsaved() };
  }

  /** Replaces this device's campaign with the file's. The current one is kept as the previous copy first. */
  async useCampaign(campaign: Campaign, fileChecksum: string): Promise<void> {
    await this.deps.store.putSetting(PREVIOUS_KEY, JSON.stringify(this.campaign));
    this.undo.length = 0;
    this.campaign = campaign;
    await this.persist();
    await this.markSaved(fileChecksum);
  }

  /** Adds monsters from a monster file; ones with the same id are replaced. */
  async addMonsters(monsters: Monster[]): Promise<void> {
    await this.update(`Load ${monsters.length} monsters`, (d) => {
      for (const m of monsters) {
        const i = d.monsters.findIndex((x) => x.id === m.id);
        if (i >= 0) d.monsters[i] = m;
        else d.monsters.push(m);
      }
    });
  }

  /** Brings back the copy kept before the last load (swapping it with the current one). */
  async restorePrevious(): Promise<boolean> {
    const raw = await this.deps.store.getSetting(PREVIOUS_KEY);
    if (raw === undefined) return false;
    const parsed = CampaignSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return false;
    await this.deps.store.putSetting(PREVIOUS_KEY, JSON.stringify(this.campaign));
    this.undo.length = 0;
    this.campaign = parsed.data;
    await this.persist();
    return true;
  }

  async hasPrevious(): Promise<boolean> {
    return (await this.deps.store.getSetting(PREVIOUS_KEY)) !== undefined;
  }
}
