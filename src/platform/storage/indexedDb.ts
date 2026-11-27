// IndexedDB store. Inside Owlbear this works and persists (Phase 1 spike, DESIGN.md §5.4).
import type { CharacterRecord, CharacterStore, SnapshotRecord } from "./types";

export const DB_NAME = "nimble-bear";
const DB_VERSION = 1;
const CHARACTERS = "characters";
const SNAPSHOTS = "snapshots";
const SETTINGS = "settings";

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function openCharacterDb(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHARACTERS)) db.createObjectStore(CHARACTERS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open IndexedDB"));
    req.onblocked = () => reject(new Error("IndexedDB is blocked by another open copy of Nimble Bear."));
  });
}

export async function createIndexedDbStore(factory: IDBFactory = indexedDB): Promise<CharacterStore> {
  const db = await openCharacterDb(factory);

  async function read<T>(store: string, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const tx = db.transaction(store, "readonly");
    const result = await promisify(op(tx.objectStore(store)));
    await done(tx);
    return result;
  }

  async function write<T>(store: string, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const tx = db.transaction(store, "readwrite");
    const result = await promisify(op(tx.objectStore(store)));
    await done(tx); // resolves only once the write is committed
    return result;
  }

  return {
    listCharacters: () => read(CHARACTERS, (s) => s.getAll() as IDBRequest<CharacterRecord[]>),
    getCharacter: (id) => read(CHARACTERS, (s) => s.get(id) as IDBRequest<CharacterRecord | undefined>),
    putCharacter: async (r) => void (await write(CHARACTERS, (s) => s.put(r))),
    deleteCharacter: async (id) => void (await write(CHARACTERS, (s) => s.delete(id))),
    addSnapshot: async (snap) => {
      // Let IndexedDB assign the key.
      const rest: SnapshotRecord = { ...snap };
      delete rest.id;
      return (await write(SNAPSHOTS, (s) => s.add(rest))) as number;
    },
    listSnapshots: () => read(SNAPSHOTS, (s) => s.getAll() as IDBRequest<SnapshotRecord[]>),
    getSnapshot: (id) => read(SNAPSHOTS, (s) => s.get(id) as IDBRequest<SnapshotRecord | undefined>),
    deleteSnapshot: async (id) => void (await write(SNAPSHOTS, (s) => s.delete(id))),
    getSetting: (k) => read(SETTINGS, (s) => s.get(k) as IDBRequest<string | undefined>),
    putSetting: async (k, v) => void (await write(SETTINGS, (s) => s.put(v, k))),
  };
}
