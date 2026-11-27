import { createHash } from "node:crypto";
import { newCharacter, type Character } from "../../src/rules/persistence/character";

/** Node SHA-256, matching the browser's Web Crypto output (lowercase hex). */
export const nodeHash = async (text: string): Promise<string> => createHash("sha256").update(text, "utf8").digest("hex");

/** A filled-in character that exercises every part of the v1 format. IDs are placeholders, not game data. */
export function sampleCharacter(): Character {
  const c = newCharacter("00000000-0000-4000-8000-000000000001", "Test Hero", "2026-11-27T12:00:00.000Z");
  c.revision = 7;
  c.updatedAt = "2026-11-27T13:00:00.000Z";
  c.content = { core: "3.2", "test-class": "1.0" };
  c.build = {
    stats: { method: "standard", assign: { STR: 2, DEX: 2, INT: 0, WIL: -1 } },
    ancestry: { id: "ancestry.test", choices: { size: ["small"] } },
    background: { id: "background.test", choices: {} },
    languages: ["common"],
    levels: [
      { level: 1, classId: "class.test", hp: { method: "starting", value: 10 }, skill: { add: null, move: null }, choices: {} },
      {
        level: 2,
        classId: "class.test",
        hp: { method: "average", value: 4 },
        skill: { add: "skill.a", move: { from: "skill.b", to: "skill.c" } },
        choices: { "choice.x": ["opt.y"] },
      },
    ],
  };
  c.play = {
    hp: 11,
    tempHp: 3,
    wounds: 1,
    hitDiceSpent: 1,
    resources: { "res.dice": { current: 1, faces: [3] }, "res.count": { current: 2 } },
    conditions: [{ id: "condition.test", note: "until end of turn" }],
    inventory: [{ itemId: "item.test", name: "Test Item", qty: 2, equipped: true, notes: "" }],
    gold: 12.5,
    notes: "Unicode check: é ñ ü — “quotes” 🐻",
    restChoices: { "feature.rest": "opt.a" },
  };
  c.overrides = { defense: 7 };
  c.settings = { deflect: true };
  return c;
}
