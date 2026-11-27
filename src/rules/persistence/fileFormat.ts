// The character file: a versioned JSON envelope (DESIGN.md §5.2).
import { characterLevel, type Character } from "./character";
import { checksumOf, type Hasher } from "./canonical";
import { CURRENT_SCHEMA_VERSION, migrateCharacter } from "./migrations";

export const FILE_FORMAT = "nimble-bear/character";

export interface CharacterFile {
  format: typeof FILE_FORMAT;
  schemaVersion: number;
  appVersion: string;
  savedAt: string;
  checksum: string;
  character: Character;
}

export async function buildCharacterFile(
  character: Character,
  appVersion: string,
  savedAt: string,
  hash: Hasher,
): Promise<{ text: string; checksum: string }> {
  const checksum = await checksumOf(character, hash);
  const file: CharacterFile = { format: FILE_FORMAT, schemaVersion: CURRENT_SCHEMA_VERSION, appVersion, savedAt, checksum, character };
  return { text: `${JSON.stringify(file, null, 2)}\n`, checksum };
}

export type ParsedFile =
  | {
      ok: true;
      character: Character;
      /** Checksum of the character as it is now (after any upgrade). */
      checksum: string;
      /** False when the file's checksum doesn't match its contents (edited or damaged). */
      checksumMatches: boolean;
      migratedFrom: number | null;
      savedAt: string | null;
      appVersion: string | null;
    }
  | { ok: false; error: string };

export async function parseCharacterFile(text: string, hash: Hasher): Promise<ParsedFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This isn't a Nimble Bear character file (it isn't valid JSON)." };
  }
  if (raw === null || typeof raw !== "object") return { ok: false, error: "This isn't a Nimble Bear character file." };
  const env = raw as Record<string, unknown>;
  if (env["format"] !== FILE_FORMAT) return { ok: false, error: "This isn't a Nimble Bear character file (wrong format marker)." };
  if (typeof env["schemaVersion"] !== "number") return { ok: false, error: "The file has no format version." };

  const stated = typeof env["checksum"] === "string" ? env["checksum"] : null;
  const checksumMatches = stated !== null && stated === (await checksumOf(env["character"], hash));

  const migrated = migrateCharacter(env["character"], env["schemaVersion"]);
  if (!migrated.ok) return migrated;

  return {
    ok: true,
    character: migrated.character,
    checksum: migrated.migratedFrom === null && stated !== null && checksumMatches ? stated : await checksumOf(migrated.character, hash),
    checksumMatches,
    migratedFrom: migrated.migratedFrom,
    savedAt: typeof env["savedAt"] === "string" ? env["savedAt"] : null,
    appVersion: typeof env["appVersion"] === "string" ? env["appVersion"] : null,
  };
}

/** e.g. "Brakka_L3_2026-11-26.nimble.json". `date` is YYYY-MM-DD in the player's time zone. */
export function characterFileName(character: Character, date: string): string {
  const safe = character.name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return `${safe || "Character"}_L${characterLevel(character)}_${date}.nimble.json`;
}
