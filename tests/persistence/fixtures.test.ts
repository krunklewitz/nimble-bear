// Every save-format version keeps fixture files forever. These tests load all of them
// through the current migration chain. When CURRENT_SCHEMA_VERSION goes up, the old
// version's folder must already hold fixtures (enforced below).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCharacterFile, parseCharacterFile } from "../../src/rules/persistence/fileFormat";
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrateCharacter } from "../../src/rules/persistence/migrations";
import { nodeHash, sampleCharacter } from "../helpers/sample";

const root = join(__dirname, "..", "fixtures", "saves");
const jsonFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []);

describe("saved-file fixtures", () => {
  it("regenerates the current-version fixture only when asked (UPDATE_FIXTURES=1)", async () => {
    if (process.env["UPDATE_FIXTURES"] !== "1") return;
    const dir = join(root, `v${CURRENT_SCHEMA_VERSION}`);
    mkdirSync(dir, { recursive: true });
    const { text } = await buildCharacterFile(sampleCharacter(), "fixture", "2026-11-27T14:00:00.000Z", nodeHash);
    writeFileSync(join(dir, "sample-character.nimble.json"), text);
  });

  it("has fixtures for every version up to the current one", () => {
    for (let v = 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      expect(jsonFiles(join(root, `v${v}`)).length, `no fixtures for format v${v}`).toBeGreaterThan(0);
    }
  });

  it("has a migration step for every older version", () => {
    for (let v = 1; v < CURRENT_SCHEMA_VERSION; v++) expect(MIGRATIONS[v], `missing migration ${v}→${v + 1}`).toBeTypeOf("function");
  });

  for (let v = 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    for (const f of jsonFiles(join(root, `v${v}`))) {
      it(`loads v${v}/${f} with the current app`, async () => {
        const parsed = await parseCharacterFile(readFileSync(join(root, `v${v}`, f), "utf8"), nodeHash);
        expect(parsed.ok, parsed.ok ? "" : parsed.error).toBe(true);
        if (parsed.ok) {
          expect(parsed.checksumMatches).toBe(true);
          expect(parsed.migratedFrom).toBe(v === CURRENT_SCHEMA_VERSION ? null : v);
        }
      });
    }
  }

  it("never edits its input when migrating", () => {
    const raw = structuredClone(sampleCharacter());
    const before = JSON.stringify(raw);
    migrateCharacter(raw, 1);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("rejects unknown and future versions", () => {
    expect(migrateCharacter({}, 0).ok).toBe(false);
    expect(migrateCharacter({}, CURRENT_SCHEMA_VERSION + 1).ok).toBe(false);
  });
});
