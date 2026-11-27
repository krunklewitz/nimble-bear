// The character library: glue between pure rules (src/rules/persistence) and storage
// (src/platform/storage). No React. Owns autosave, file save/load, snapshots and
// migration of stored data. Persistence rules: DESIGN.md §5.3.
import { CharacterV1, edit, newCharacter, type Character } from "../rules/persistence/character";
import { checksumOf, type Hasher } from "../rules/persistence/canonical";
import { buildCharacterFile, characterFileName, parseCharacterFile } from "../rules/persistence/fileFormat";
import { decideLoad, emptyMeta, type SaveMeta } from "../rules/persistence/loadDecision";
import { CURRENT_SCHEMA_VERSION, migrateCharacter } from "../rules/persistence/migrations";
import type { CharacterRecord, CharacterStore, SnapshotReason, SnapshotRecord } from "../platform/storage/types";

export const SNAPSHOTS_KEPT_PER_CHARACTER = 20;
const ACTIVE_KEY = "activeCharacterId";

export interface LibraryDeps {
  store: CharacterStore;
  hash: Hasher;
  now: () => Date;
  newId: () => string;
  appVersion: string;
  /** Local date (YYYY-MM-DD) for file names. */
  dateStamp: () => string;
}

export type Entry =
  | {
      status: "ok";
      id: string;
      character: Character;
      /** Checksum of `character`, or null while it's being computed. */
      checksum: string | null;
      meta: SaveMeta;
    }
  | { status: "broken"; id: string; name: string; error: string; record: CharacterRecord };

export interface ParsedImport {
  character: Character;
  checksum: string;
  checksumMatches: boolean;
  migratedFrom: number | null;
  savedAt: string | null;
}

export type ImportPlan =
  | { kind: "invalid"; error: string }
  | { kind: "new" | "same" | "replace"; parsed: ParsedImport; local: Character | null }
  | { kind: "conflict"; reason: "local-unsaved" | "local-newer" | "diverged"; parsed: ParsedImport; local: Character };

export type ImportChoice = "keepLocal" | "useFile" | "keepBoth";

export interface ImportResult {
  id: string | null;
  /** True when the stored copy, read back from storage, matches the file's checksum exactly. */
  exact: boolean | null;
}

export function isUnsaved(entry: Entry): boolean {
  if (entry.status !== "ok") return false;
  if (entry.checksum === null) return true;
  return entry.meta.lastSavedChecksum !== entry.checksum;
}

export class CharacterLibrary {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private readonly dirty = new Set<string>();
  private draining: Promise<void> | null = null;
  private version = 0;
  activeId: string | null = null;
  /** Last error writing to browser storage, shown to the player. */
  storageError: string | null = null;

  private constructor(private readonly deps: LibraryDeps) {}

  static async open(deps: LibraryDeps): Promise<CharacterLibrary> {
    const lib = new CharacterLibrary(deps);
    await lib.loadAll();
    return lib;
  }

  // ---- subscription (for React's useSyncExternalStore) ----
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;
  private changed() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  list(): Entry[] {
    const name = (e: Entry) => (e.status === "ok" ? e.character.name : e.name);
    return [...this.entries.values()].sort((a, b) => name(a).localeCompare(name(b)));
  }

  get(id: string): Entry | undefined {
    return this.entries.get(id);
  }

  private iso = () => this.deps.now().toISOString();

  // ---- startup ----
  private async loadAll() {
    for (const record of await this.deps.store.listCharacters()) {
      await this.loadRecord(record);
    }
    const active = await this.deps.store.getSetting(ACTIVE_KEY);
    this.activeId = active && this.entries.has(active) ? active : null;
    this.changed();
  }

  private async loadRecord(record: CharacterRecord) {
    const nameOf = (raw: unknown) =>
      raw && typeof raw === "object" && typeof (raw as { name?: unknown }).name === "string" ? (raw as { name: string }).name : "Unnamed";
    if (record.schemaVersion < CURRENT_SCHEMA_VERSION) {
      // Keep the original before upgrading it.
      await this.snapshotRaw(record, "before-migration");
    }
    const result = migrateCharacter(record.character, record.schemaVersion);
    if (!result.ok) {
      this.entries.set(record.id, { status: "broken", id: record.id, name: nameOf(record.character), error: result.error, record });
      return;
    }
    const entry: Entry = { status: "ok", id: record.id, character: result.character, checksum: await checksumOf(result.character, this.deps.hash), meta: record.meta };
    this.entries.set(record.id, entry);
    if (result.migratedFrom !== null) await this.deps.store.putCharacter(this.toRecord(entry));
  }

  private toRecord(entry: Extract<Entry, { status: "ok" }>): CharacterRecord {
    return { id: entry.id, schemaVersion: CURRENT_SCHEMA_VERSION, character: entry.character, meta: entry.meta };
  }

  // ---- autosave ----
  private scheduleWrite(id: string) {
    this.dirty.add(id);
    if (!this.draining) this.draining = this.drain();
  }

  private async drain(): Promise<void> {
    try {
      while (this.dirty.size > 0) {
        const id = this.dirty.values().next().value as string;
        this.dirty.delete(id);
        const entry = this.entries.get(id);
        if (entry?.status === "ok") await this.deps.store.putCharacter(this.toRecord(entry));
      }
      if (this.storageError) {
        this.storageError = null;
        this.changed();
      }
    } catch (e) {
      this.storageError = e instanceof Error ? e.message : String(e);
      this.changed();
    } finally {
      this.draining = null;
    }
  }

  /** Resolves once every change so far is committed to storage. */
  async flush(): Promise<void> {
    while (this.draining) await this.draining;
  }

  private async refreshChecksum(id: string) {
    const entry = this.entries.get(id);
    if (entry?.status !== "ok") return;
    const revision = entry.character.revision;
    const checksum = await checksumOf(entry.character, this.deps.hash);
    const latest = this.entries.get(id);
    if (latest?.status === "ok" && latest.character.revision === revision) {
      this.entries.set(id, { ...latest, checksum });
      this.changed();
    }
  }

  // ---- editing ----
  async setActive(id: string | null) {
    this.activeId = id;
    this.changed();
    if (id) await this.deps.store.putSetting(ACTIVE_KEY, id);
  }

  async create(name: string): Promise<string> {
    const id = this.deps.newId();
    const character = newCharacter(id, name, this.iso());
    this.entries.set(id, { status: "ok", id, character, checksum: await checksumOf(character, this.deps.hash), meta: emptyMeta() });
    this.scheduleWrite(id);
    await this.setActive(id);
    return id;
  }

  /** Applies a change in memory at once, then autosaves. */
  update(id: string, change: (draft: Character) => void): void {
    const entry = this.entries.get(id);
    if (entry?.status !== "ok") return;
    const character = edit(entry.character, this.iso(), change);
    const parsed = CharacterV1.safeParse(character);
    if (!parsed.success) throw new Error(`Invalid change: ${parsed.error.issues[0]?.message ?? "unknown"}`);
    this.entries.set(id, { ...entry, character: parsed.data, checksum: null });
    this.changed();
    this.scheduleWrite(id);
    void this.refreshChecksum(id);
  }

  // ---- saving to a file ----
  /** Builds the file and records it as saved. The caller starts the download. */
  async saveToFile(id: string): Promise<{ fileName: string; text: string }> {
    const entry = this.entries.get(id);
    if (entry?.status !== "ok") throw new Error("Character not found.");
    const savedAt = this.iso();
    const { text, checksum } = await buildCharacterFile(entry.character, this.deps.appVersion, savedAt, this.deps.hash);
    const latest = this.entries.get(id);
    if (latest?.status === "ok") {
      this.entries.set(id, {
        ...latest,
        meta: { ...latest.meta, lastSavedChecksum: checksum, lastSavedRevision: entry.character.revision, lastSavedAt: savedAt },
      });
      this.changed();
      this.scheduleWrite(id);
    }
    return { fileName: characterFileName(entry.character, this.deps.dateStamp()), text };
  }

  /** File text without marking it saved (clipboard backup). */
  async fileText(id: string): Promise<string> {
    const entry = this.entries.get(id);
    if (entry?.status !== "ok") throw new Error("Character not found.");
    return (await buildCharacterFile(entry.character, this.deps.appVersion, this.iso(), this.deps.hash)).text;
  }

  async endSession(id: string) {
    const entry = this.entries.get(id);
    if (entry?.status !== "ok") return;
    this.entries.set(id, { ...entry, meta: { ...entry.meta, sessionEndedAt: this.iso() } });
    this.changed();
    this.scheduleWrite(id);
    await this.flush();
  }

  // ---- loading a file ----
  /** Reads a file and works out what loading it would do. Changes nothing. */
  async prepareImport(text: string): Promise<ImportPlan> {
    const parsed = await parseCharacterFile(text, this.deps.hash);
    if (!parsed.ok) return { kind: "invalid", error: parsed.error };
    const incoming: ParsedImport = {
      character: parsed.character,
      checksum: parsed.checksum,
      checksumMatches: parsed.checksumMatches,
      migratedFrom: parsed.migratedFrom,
      savedAt: parsed.savedAt,
    };
    const local = this.entries.get(parsed.character.id);
    if (local?.status === "broken") return { kind: "conflict", reason: "diverged", parsed: incoming, local: parsed.character };
    const localChecksum = local?.status === "ok" ? (local.checksum ?? (await checksumOf(local.character, this.deps.hash))) : null;
    const decision = decideLoad(
      incoming,
      local?.status === "ok" && localChecksum ? { character: local.character, checksum: localChecksum, meta: local.meta } : null,
    );
    const localCharacter = local?.status === "ok" ? local.character : null;
    if (decision.kind === "conflict") {
      return { kind: "conflict", reason: decision.reason, parsed: incoming, local: localCharacter ?? parsed.character };
    }
    return { kind: decision.kind, parsed: incoming, local: localCharacter };
  }

  async applyImport(plan: ImportPlan, choice: ImportChoice = "useFile"): Promise<ImportResult> {
    if (plan.kind === "invalid") return { id: null, exact: null };
    const { parsed } = plan;
    const id = parsed.character.id;
    if (plan.kind === "same") {
      await this.setActive(id);
      return { id, exact: true };
    }
    if (plan.kind === "conflict" && choice === "keepLocal") return { id, exact: null };

    const savedMeta: SaveMeta = {
      ...emptyMeta(),
      // A file in an older format should be saved again in the new one.
      lastSavedChecksum: parsed.migratedFrom === null ? parsed.checksum : null,
      lastSavedRevision: parsed.character.revision,
      lastSavedAt: parsed.savedAt,
    };

    if (plan.kind === "conflict" && choice === "keepBoth") {
      const copyId = this.deps.newId();
      const character: Character = { ...structuredClone(parsed.character), id: copyId, name: `${parsed.character.name} (copy)`.slice(0, 80) };
      const entry: Entry = { status: "ok", id: copyId, character, checksum: await checksumOf(character, this.deps.hash), meta: emptyMeta() };
      this.entries.set(copyId, entry);
      await this.deps.store.putCharacter(this.toRecord(entry));
      await this.setActive(copyId);
      return { id: copyId, exact: null };
    }

    // "new", "replace", or conflict resolved with "useFile".
    const existing = this.entries.get(id);
    if (existing) await this.snapshotEntry(existing, "before-load");
    await this.flush();
    const entry: Entry = { status: "ok", id, character: parsed.character, checksum: parsed.checksum, meta: savedMeta };
    this.entries.set(id, entry);
    this.dirty.delete(id);
    await this.deps.store.putCharacter(this.toRecord(entry));
    await this.setActive(id);
    return { id, exact: await this.verifyStored(id, parsed.checksum) };
  }

  /** Reads the character back from storage and compares checksums. */
  async verifyStored(id: string, expected: string): Promise<boolean> {
    const record = await this.deps.store.getCharacter(id);
    if (!record) return false;
    return (await checksumOf(record.character, this.deps.hash)) === expected;
  }

  // ---- snapshots ----
  private async snapshotEntry(entry: Entry, reason: SnapshotReason) {
    const record = entry.status === "ok" ? this.toRecord(entry) : entry.record;
    await this.snapshotRaw(record, reason);
  }

  private async snapshotRaw(record: CharacterRecord, reason: SnapshotReason) {
    const raw = record.character as { name?: unknown };
    await this.deps.store.addSnapshot({
      characterId: record.id,
      characterName: typeof raw?.name === "string" ? raw.name : "Unnamed",
      takenAt: this.iso(),
      reason,
      schemaVersion: record.schemaVersion,
      character: structuredClone(record.character),
      meta: structuredClone(record.meta),
    });
    await this.pruneSnapshots(record.id);
  }

  private async pruneSnapshots(characterId: string) {
    const prunable = (await this.deps.store.listSnapshots())
      .filter((s) => s.characterId === characterId && s.reason !== "before-migration")
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    for (const s of prunable.slice(SNAPSHOTS_KEPT_PER_CHARACTER)) {
      if (s.id !== undefined) await this.deps.store.deleteSnapshot(s.id);
    }
  }

  /** Newest first. With an id, only that character's; without, all (incl. deleted characters). */
  async listSnapshots(characterId?: string): Promise<SnapshotRecord[]> {
    return (await this.deps.store.listSnapshots())
      .filter((s) => characterId === undefined || s.characterId === characterId)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }

  async restoreSnapshot(snapshotId: number): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const snap = await this.deps.store.getSnapshot(snapshotId);
    if (!snap) return { ok: false, error: "Snapshot not found." };
    const result = migrateCharacter(snap.character, snap.schemaVersion);
    if (!result.ok) return { ok: false, error: result.error };
    const existing = this.entries.get(snap.characterId);
    if (existing) await this.snapshotEntry(existing, "before-restore");
    await this.flush();
    const entry: Entry = {
      status: "ok",
      id: snap.characterId,
      character: result.character,
      checksum: await checksumOf(result.character, this.deps.hash),
      meta: snap.meta,
    };
    this.entries.set(entry.id, entry);
    this.dirty.delete(entry.id);
    await this.deps.store.putCharacter(this.toRecord(entry));
    await this.setActive(entry.id);
    return { ok: true, id: entry.id };
  }

  /** Removes a character from this device, keeping a snapshot so it can be recovered. */
  async deleteCharacter(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    await this.snapshotEntry(entry, "before-delete");
    await this.flush();
    this.entries.delete(id);
    this.dirty.delete(id);
    await this.deps.store.deleteCharacter(id);
    if (this.activeId === id) await this.setActive(null);
    this.changed();
  }
}
