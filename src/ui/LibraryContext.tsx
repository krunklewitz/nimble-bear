import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CharacterLibrary } from "../app/library";
import { localDateStamp, newId, sha256Hex } from "../platform/files";
import { createIndexedDbStore } from "../platform/storage/indexedDb";
import { createMemoryStore } from "../platform/storage/memory";
import type { CharacterStore } from "../platform/storage/types";

interface LibraryState {
  library: CharacterLibrary;
  /** Set when IndexedDB couldn't open and the app is keeping data in memory only. */
  memoryOnly: string | null;
}

const Ctx = createContext<LibraryState | null>(null);

async function openStore(): Promise<{ store: CharacterStore; memoryOnly: string | null }> {
  try {
    return { store: await createIndexedDbStore(), memoryOnly: null };
  } catch (e) {
    return { store: createMemoryStore(), memoryOnly: e instanceof Error ? e.message : String(e) };
  }
}

export function LibraryProvider({ version, store, children }: { version: string; store?: CharacterStore; children: ReactNode }) {
  const [state, setState] = useState<LibraryState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opened = store ? { store, memoryOnly: null } : await openStore();
        const library = await CharacterLibrary.open({
          store: opened.store,
          hash: sha256Hex,
          now: () => new Date(),
          newId,
          appVersion: version,
          dateStamp: () => localDateStamp(),
        });
        if (!cancelled) setState({ library, memoryOnly: opened.memoryOnly });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, version]);

  if (error) return <p className="screen banner error" role="alert">Couldn't start Nimble Bear: {error}</p>;
  if (!state) return <p className="screen" role="status">Opening your characters…</p>;
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

/** The library, re-rendering whenever it changes. */
export function useLibrary(): LibraryState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useLibrary must be used inside LibraryProvider");
  useSyncExternalStore(value.library.subscribe, value.library.getVersion);
  return value;
}
