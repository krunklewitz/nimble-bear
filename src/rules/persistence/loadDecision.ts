// Decides what loading a file may do without asking (DESIGN.md §5.3).
// Rule: never overwrite newer or unsaved local data without showing both and asking.
import type { Character } from "./character";

export interface SaveMeta {
  /** Checksum of the character when it was last saved to (or loaded from) a file. */
  lastSavedChecksum: string | null;
  lastSavedRevision: number | null;
  lastSavedAt: string | null;
  sessionEndedAt: string | null;
}

export const emptyMeta = (): SaveMeta => ({ lastSavedChecksum: null, lastSavedRevision: null, lastSavedAt: null, sessionEndedAt: null });

export const hasUnsavedChanges = (meta: SaveMeta, currentChecksum: string): boolean => meta.lastSavedChecksum !== currentChecksum;

export type LoadDecision =
  | { kind: "new" }
  | { kind: "same" }
  | { kind: "replace" }
  | { kind: "conflict"; reason: "local-unsaved" | "local-newer" | "diverged" };

export function decideLoad(
  incoming: { character: Character; checksum: string },
  local: { character: Character; checksum: string; meta: SaveMeta } | null,
): LoadDecision {
  if (!local) return { kind: "new" };
  if (local.checksum === incoming.checksum) return { kind: "same" };
  const unsaved = hasUnsavedChanges(local.meta, local.checksum);
  if (unsaved) return { kind: "conflict", reason: "local-unsaved" };
  if (incoming.character.revision > local.character.revision) return { kind: "replace" };
  if (incoming.character.revision < local.character.revision) return { kind: "conflict", reason: "local-newer" };
  return { kind: "conflict", reason: "diverged" };
}

export const CONFLICT_TEXT: Record<"local-unsaved" | "local-newer" | "diverged", string> = {
  "local-unsaved": "This computer has changes that aren't in the file.",
  "local-newer": "The copy on this computer is newer than the file.",
  diverged: "Both copies have changed since they were last the same.",
};
