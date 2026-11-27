import type { SaveMeta } from "../../rules/persistence/loadDecision";

/** One character as stored on this device. `character` is raw data in format `schemaVersion`. */
export interface CharacterRecord {
  id: string;
  schemaVersion: number;
  character: unknown;
  meta: SaveMeta;
}

export type SnapshotReason = "before-load" | "before-restore" | "before-migration" | "before-delete" | "before-level-up";

export interface SnapshotRecord {
  /** Assigned by the store. */
  id?: number;
  characterId: string;
  characterName: string;
  takenAt: string;
  reason: SnapshotReason;
  schemaVersion: number;
  character: unknown;
  meta: SaveMeta;
}

/** Local storage for characters. IndexedDB in the browser; in-memory in tests. */
export interface CharacterStore {
  listCharacters(): Promise<CharacterRecord[]>;
  getCharacter(id: string): Promise<CharacterRecord | undefined>;
  putCharacter(record: CharacterRecord): Promise<void>;
  deleteCharacter(id: string): Promise<void>;
  addSnapshot(snapshot: SnapshotRecord): Promise<number>;
  listSnapshots(): Promise<SnapshotRecord[]>;
  getSnapshot(id: number): Promise<SnapshotRecord | undefined>;
  deleteSnapshot(id: number): Promise<void>;
  getSetting(key: string): Promise<string | undefined>;
  putSetting(key: string, value: string): Promise<void>;
}
