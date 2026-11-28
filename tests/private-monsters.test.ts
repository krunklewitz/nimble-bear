// Checks the GM's private monster files (made by scripts/extract-monsters.mjs into the
// git-ignored private/ folder) load cleanly into the app. Skipped where they don't exist,
// e.g. on any machine without the books. Contains no monster data itself.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/platform/files";
import { parseCampaignFile } from "../src/rules/persistence/campaign";

const dir = join(process.cwd(), "private", "monsters");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".nimble-monsters.json")) : [];

describe.skipIf(files.length === 0)("private monster files", () => {
  for (const f of files) {
    it(`${f} loads with every monster valid and unique ids`, async () => {
      const parsed = await parseCampaignFile(readFileSync(join(dir, f), "utf8"), sha256Hex);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok || parsed.kind !== "monsters") return;
      expect(parsed.skipped).toEqual([]);
      expect(parsed.monsters.length).toBeGreaterThan(50);
      expect(new Set(parsed.monsters.map((m) => m.id)).size).toBe(parsed.monsters.length);
    });
  }
});
