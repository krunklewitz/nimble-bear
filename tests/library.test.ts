// The character library against both stores: in-memory and real IndexedDB code
// (fake-indexeddb). "Another browser" and "cleared browser data" are a brand-new store.
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { CharacterLibrary, isUnsaved, SNAPSHOTS_KEPT_PER_CHARACTER, type LibraryDeps } from "../src/app/library";
import { canonicalJson, checksumOf } from "../src/rules/persistence/canonical";
import { buildCharacterFile } from "../src/rules/persistence/fileFormat";
import { createIndexedDbStore } from "../src/platform/storage/indexedDb";
import { createMemoryStore } from "../src/platform/storage/memory";
import type { CharacterStore } from "../src/platform/storage/types";
import { nodeHash, sampleCharacter } from "./helpers/sample";

/** Fails the test with a clear message instead of using a non-null assertion. */
function must<T>(v: T | null | undefined, what = "value"): T {
  if (v === null || v === undefined) throw new Error(`expected ${what}`);
  return v;
}

let counter = 0;
function deps(store: CharacterStore): LibraryDeps {
  let t = Date.parse("2026-11-27T12:00:00Z");
  return {
    store,
    hash: nodeHash,
    now: () => new Date((t += 1000)),
    newId: () => `id-${++counter}`,
    appVersion: "test",
    dateStamp: () => "2026-11-27",
  };
}

const stores: [string, () => Promise<CharacterStore>][] = [
  ["memory", async () => createMemoryStore()],
  ["indexeddb", () => createIndexedDbStore(new IDBFactory())],
];

for (const [kind, makeStore] of stores) {
  describe(`CharacterLibrary (${kind})`, () => {
    const open = async (store?: CharacterStore) => {
      const s = store ?? (await makeStore());
      return { store: s, lib: await CharacterLibrary.open(deps(s)) };
    };

    it("autosaves every change to storage and reopens ready to play", async () => {
      const { store, lib } = await open();
      const id = await lib.create("Brakka");
      lib.update(id, (d) => void (d.play.hp = 12));
      lib.update(id, (d) => void (d.play.notes = "hello"));
      await lib.flush();
      const reopened = await CharacterLibrary.open(deps(store));
      const e = reopened.get(id);
      expect(e?.status === "ok" && e.character.play.hp).toBe(12);
      expect(e?.status === "ok" && e.character.play.notes).toBe("hello");
      expect(e?.status === "ok" && e.character.revision).toBe(2);
      expect(reopened.activeId).toBe(id);
    });

    it("tracks unsaved changes and clears them on file save", async () => {
      const { lib } = await open();
      const id = await lib.create("Brakka");
      expect(isUnsaved(must(lib.get(id), "entry"))).toBe(true);
      const { fileName } = await lib.saveToFile(id);
      expect(fileName).toBe("Brakka_L1_2026-11-27.nimble.json");
      expect(isUnsaved(must(lib.get(id), "entry"))).toBe(false);
      lib.update(id, (d) => void (d.play.gold = 5));
      expect(isUnsaved(must(lib.get(id), "entry"))).toBe(true);
    });

    it("restores exactly into a fresh store (cleared data or another browser)", async () => {
      const { lib } = await open();
      const id = await lib.create("Brakka");
      lib.update(id, (d) => {
        d.play.hp = 9;
        d.play.notes = "Unicode 🐻 é";
      });
      await lib.flush();
      const { text } = await lib.saveToFile(id);
      const original = lib.get(id);

      const { lib: fresh } = await open(await makeStore());
      const plan = await fresh.prepareImport(text);
      expect(plan.kind).toBe("new");
      const result = await fresh.applyImport(plan);
      expect(result.exact).toBe(true);
      const restored = fresh.get(id);
      expect(restored?.status === "ok" && original?.status === "ok" && canonicalJson(restored.character) === canonicalJson(original.character)).toBe(true);
      expect(isUnsaved(must(restored, "restored entry"))).toBe(false);
    });

    it("loads a newer file silently when nothing local is unsaved, keeping a snapshot", async () => {
      const { lib } = await open();
      const id = await lib.create("Brakka");
      const { text: v1 } = await lib.saveToFile(id);
      // Another computer loads v1, plays, saves v2.
      const { lib: other } = await open(await makeStore());
      await other.applyImport(await other.prepareImport(v1));
      other.update(id, (d) => void (d.play.hp = 20));
      const { text: v2 } = await other.saveToFile(id);

      const plan = await lib.prepareImport(v2);
      expect(plan.kind).toBe("replace");
      expect((await lib.applyImport(plan)).exact).toBe(true);
      const e = lib.get(id);
      expect(e?.status === "ok" && e.character.play.hp).toBe(20);
      expect((await lib.listSnapshots(id)).map((s) => s.reason)).toContain("before-load");
    });

    it("never overwrites unsaved local changes without asking; keepLocal changes nothing", async () => {
      const { store, lib } = await open();
      const id = await lib.create("Brakka");
      const { text } = await lib.saveToFile(id);
      lib.update(id, (d) => void (d.play.hp = 3));
      await lib.flush();
      const before = await store.getCharacter(id);

      const plan = await lib.prepareImport(text);
      expect(plan).toMatchObject({ kind: "conflict", reason: "local-unsaved" });
      await lib.applyImport(plan, "keepLocal");
      await lib.flush();
      expect(await store.getCharacter(id)).toEqual(before);
    });

    it("useFile replaces after a snapshot; keepBoth adds a copy", async () => {
      const { lib } = await open();
      const id = await lib.create("Brakka");
      const { text } = await lib.saveToFile(id);
      lib.update(id, (d) => void (d.play.hp = 3));

      const both = await lib.applyImport(await lib.prepareImport(text), "keepBoth");
      expect(both.id).not.toBe(id);
      const copy = lib.get(must(both.id, "copy id"));
      expect(copy?.status === "ok" && copy.character.name).toBe("Brakka (copy)");
      const kept = lib.get(id);
      expect(kept?.status === "ok" && kept.character.play.hp).toBe(3);

      const use = await lib.applyImport(await lib.prepareImport(text), "useFile");
      expect(use.exact).toBe(true);
      const replaced = lib.get(id);
      expect(replaced?.status === "ok" && replaced.character.play.hp).toBe(0);
      const snaps = await lib.listSnapshots(id);
      const snapChar = snaps[0]?.character as { play: { hp: number } };
      expect(snapChar.play.hp).toBe(3);
    });

    it("leaves everything untouched when a file is invalid", async () => {
      const { store, lib } = await open();
      const id = await lib.create("Brakka");
      await lib.flush();
      const before = await store.listCharacters();
      const plan = await lib.prepareImport("{ broken");
      expect(plan.kind).toBe("invalid");
      expect(await lib.applyImport(plan)).toEqual({ id: null, exact: null });
      expect(await store.listCharacters()).toEqual(before);
      expect(lib.get(id)?.status).toBe("ok");
    });

    it("keeps a snapshot on delete and can bring the character back", async () => {
      const { lib } = await open();
      const id = await lib.create("Brakka");
      lib.update(id, (d) => void (d.play.gold = 77));
      await lib.deleteCharacter(id);
      expect(lib.get(id)).toBeUndefined();
      const [snap] = await lib.listSnapshots();
      expect(snap?.reason).toBe("before-delete");
      const r = await lib.restoreSnapshot(must(must(snap, "snapshot").id, "snapshot id"));
      expect(r.ok).toBe(true);
      const back = lib.get(id);
      expect(back?.status === "ok" && back.character.play.gold).toBe(77);
    });

    it("prunes snapshots to the newest per character (except pre-migration ones)", async () => {
      const { lib } = await open();
      const id = await lib.create("Brakka");
      const { text } = await lib.saveToFile(id);
      for (let i = 0; i < SNAPSHOTS_KEPT_PER_CHARACTER + 5; i++) {
        await lib.applyImport(await lib.prepareImport(text), "useFile");
        lib.update(id, (d) => void (d.play.hp = i + 1));
        await lib.applyImport(await lib.prepareImport(text), "useFile");
      }
      expect((await lib.listSnapshots(id)).length).toBe(SNAPSHOTS_KEPT_PER_CHARACTER);
    });

    it("shows unreadable stored data as broken and leaves it in storage", async () => {
      const store = await makeStore();
      await store.putCharacter({ id: "bad", schemaVersion: 1, character: { name: "Oops", revision: "x" }, meta: { lastSavedChecksum: null, lastSavedRevision: null, lastSavedAt: null, sessionEndedAt: null } });
      const lib = await CharacterLibrary.open(deps(store));
      expect(lib.get("bad")?.status).toBe("broken");
      expect((await store.getCharacter("bad"))?.character).toEqual({ name: "Oops", revision: "x" });
    });

    it("records the end of a session", async () => {
      const { store, lib } = await open();
      const id = await lib.create("Brakka");
      await lib.endSession(id);
      expect((await store.getCharacter(id))?.meta.sessionEndedAt).not.toBeNull();
    });

    it("loads the committed v1 fixture with an exact match", async () => {
      const c = sampleCharacter();
      const { text } = await buildCharacterFile(c, "fixture", "2026-11-27T14:00:00.000Z", nodeHash);
      const { lib } = await open();
      const result = await lib.applyImport(await lib.prepareImport(text));
      expect(result.exact).toBe(true);
      const e = lib.get(c.id);
      expect(e?.status === "ok" && (await checksumOf(e.character, nodeHash))).toBe(await checksumOf(c, nodeHash));
    });
  });
}
