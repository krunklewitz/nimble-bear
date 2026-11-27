import { describe, expect, it } from "vitest";
import { buildCharacterFile, characterFileName, FILE_FORMAT, parseCharacterFile } from "../../src/rules/persistence/fileFormat";
import { canonicalJson } from "../../src/rules/persistence/canonical";
import { CURRENT_SCHEMA_VERSION } from "../../src/rules/persistence/migrations";
import { nodeHash, sampleCharacter } from "../helpers/sample";

describe("character file", () => {
  it("round-trips exactly", async () => {
    const c = sampleCharacter();
    const { text, checksum } = await buildCharacterFile(c, "0.2.0", "2026-11-27T14:00:00.000Z", nodeHash);
    const parsed = await parseCharacterFile(text, nodeHash);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.character).toEqual(c);
    expect(canonicalJson(parsed.character)).toBe(canonicalJson(c));
    expect(parsed.checksum).toBe(checksum);
    expect(parsed.checksumMatches).toBe(true);
    expect(parsed.migratedFrom).toBeNull();
  });

  it("writes the versioned envelope", async () => {
    const { text } = await buildCharacterFile(sampleCharacter(), "0.2.0", "2026-11-27T14:00:00.000Z", nodeHash);
    const env = JSON.parse(text) as Record<string, unknown>;
    expect(env["format"]).toBe(FILE_FORMAT);
    expect(env["schemaVersion"]).toBe(CURRENT_SCHEMA_VERSION);
    expect(env["appVersion"]).toBe("0.2.0");
    expect(String(env["checksum"])).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("flags a hand-edited file but still parses it", async () => {
    const { text } = await buildCharacterFile(sampleCharacter(), "0.2.0", "x", nodeHash);
    const edited = text.replace(`"gold": 12.5`, `"gold": 9999`);
    expect(edited).not.toBe(text);
    const parsed = await parseCharacterFile(edited, nodeHash);
    expect(parsed.ok && parsed.checksumMatches).toBe(false);
    expect(parsed.ok && parsed.character.play.gold).toBe(9999);
  });

  it("rejects non-JSON, wrong format, invalid data and newer versions with clear errors", async () => {
    expect(await parseCharacterFile("not json", nodeHash)).toMatchObject({ ok: false });
    expect(await parseCharacterFile(JSON.stringify({ format: "other" }), nodeHash)).toMatchObject({ ok: false });
    const { text } = await buildCharacterFile(sampleCharacter(), "0.2.0", "x", nodeHash);
    const env = JSON.parse(text) as Record<string, unknown>;
    const bad = { ...env, character: { ...(env["character"] as object), revision: -1 } };
    const badResult = await parseCharacterFile(JSON.stringify(bad), nodeHash);
    expect(badResult.ok).toBe(false);
    if (!badResult.ok) expect(badResult.error).toContain("revision");
    const newer = await parseCharacterFile(JSON.stringify({ ...env, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }), nodeHash);
    expect(newer.ok).toBe(false);
    if (!newer.ok) expect(newer.error).toContain("newer version");
  });

  it("names files with character name, level and date", () => {
    const c = sampleCharacter();
    expect(characterFileName(c, "2026-11-27")).toBe("Test-Hero_L2_2026-11-27.nimble.json");
    expect(characterFileName({ ...c, name: "  Ünïcode / Slash?  " }, "2026-11-27")).toBe("Unicode-Slash_L2_2026-11-27.nimble.json");
    expect(characterFileName({ ...c, name: "???" }, "2026-11-27")).toBe("Character_L2_2026-11-27.nimble.json");
  });
});
