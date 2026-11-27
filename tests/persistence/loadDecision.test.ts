import { describe, expect, it } from "vitest";
import { decideLoad, emptyMeta, hasUnsavedChanges } from "../../src/rules/persistence/loadDecision";
import { sampleCharacter } from "../helpers/sample";

const withRev = (revision: number) => ({ ...sampleCharacter(), revision });
const saved = (checksum: string) => ({ ...emptyMeta(), lastSavedChecksum: checksum });

describe("decideLoad", () => {
  it("adds a character that isn't on this computer", () => {
    expect(decideLoad({ character: withRev(3), checksum: "a" }, null)).toEqual({ kind: "new" });
  });

  it("does nothing when both copies are identical", () => {
    expect(decideLoad({ character: withRev(3), checksum: "a" }, { character: withRev(3), checksum: "a", meta: emptyMeta() })).toEqual({ kind: "same" });
  });

  it("replaces silently only when the file is newer and nothing local is unsaved", () => {
    expect(decideLoad({ character: withRev(5), checksum: "b" }, { character: withRev(3), checksum: "a", meta: saved("a") })).toEqual({ kind: "replace" });
  });

  it("asks when this computer has unsaved changes, even if the file is newer", () => {
    expect(decideLoad({ character: withRev(9), checksum: "b" }, { character: withRev(4), checksum: "a", meta: saved("old") })).toEqual({
      kind: "conflict",
      reason: "local-unsaved",
    });
  });

  it("asks when the local copy is newer", () => {
    expect(decideLoad({ character: withRev(2), checksum: "b" }, { character: withRev(4), checksum: "a", meta: saved("a") })).toEqual({
      kind: "conflict",
      reason: "local-newer",
    });
  });

  it("asks when both changed to the same revision number", () => {
    expect(decideLoad({ character: withRev(4), checksum: "b" }, { character: withRev(4), checksum: "a", meta: saved("a") })).toEqual({
      kind: "conflict",
      reason: "diverged",
    });
  });

  it("treats a never-saved character as unsaved", () => {
    expect(hasUnsavedChanges(emptyMeta(), "a")).toBe(true);
  });
});
