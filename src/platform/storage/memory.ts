import type { CharacterRecord, CharacterStore, SnapshotRecord } from "./types";

/** In-memory store: tests, and the fallback when IndexedDB can't open. */
export function createMemoryStore(): CharacterStore {
  const characters = new Map<string, CharacterRecord>();
  const snapshots = new Map<number, SnapshotRecord>();
  const settings = new Map<string, string>();
  let nextSnapshot = 1;
  const clone = <T>(v: T): T => structuredClone(v);
  return {
    listCharacters: async () => [...characters.values()].map(clone),
    getCharacter: async (id) => {
      const r = characters.get(id);
      return r ? clone(r) : undefined;
    },
    putCharacter: async (r) => void characters.set(r.id, clone(r)),
    deleteCharacter: async (id) => void characters.delete(id),
    addSnapshot: async (s) => {
      const id = nextSnapshot++;
      snapshots.set(id, { ...clone(s), id });
      return id;
    },
    listSnapshots: async () => [...snapshots.values()].map(clone),
    getSnapshot: async (id) => {
      const s = snapshots.get(id);
      return s ? clone(s) : undefined;
    },
    deleteSnapshot: async (id) => void snapshots.delete(id),
    getSetting: async (k) => settings.get(k),
    putSetting: async (k, v) => void settings.set(k, v),
  };
}
