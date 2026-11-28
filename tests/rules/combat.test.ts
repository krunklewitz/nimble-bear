import { describe, expect, it } from "vitest";
import { getContent } from "../../src/data/content";
import { createCharacter } from "../../src/rules/build";
import { combatFeatures } from "../../src/rules/combat";
import { derive } from "../../src/rules/derive";

const content = getContent();
const make = (classId: string, assign: Record<string, number>, ancestryId = "ancestry.human") =>
  createCharacter(
    content,
    { name: "T", classId, ancestryId, ancestryChoices: {}, backgroundId: "background.acrobat", backgroundChoices: {}, statArrayId: "standard", assign, skillPoints: { perception: 4 }, languages: [], kit: "class" },
    "t",
    "2026-11-28T00:00:00Z",
  );

describe("combat features (Class Abilities)", () => {
  it("includes The Cheat's Sneak Attack and Vicious Opportunist, explaining how each works", () => {
    const s = derive(content, make("class.cheat", { STR: -1, DEX: 2, INT: 2, WIL: 0 }, "ancestry.kobold"));
    const cf = combatFeatures(s);
    const names = cf.map((x) => x.feature.def.name);
    expect(names).toEqual(expect.arrayContaining(["Sneak Attack", "Vicious Opportunist", "Wily"]));
    expect(cf.find((x) => x.feature.def.name === "Sneak Attack")?.how[0]).toMatch(/automatically when you crit/);
    expect(cf.find((x) => x.feature.def.name === "Vicious Opportunist")?.how[0]).toMatch(/roll window/);
  });

  it("includes the Shepherd's Lifebinding Spirit with Mend as a usable action and Harm as an attack", () => {
    const s = derive(content, make("class.shepherd", { STR: 2, DEX: 0, INT: -1, WIL: 2 }));
    const buddy = combatFeatures(s).find((x) => x.feature.def.id === "feature.shepherd.my-buddy");
    expect(buddy?.actions.map((a) => a.id)).toContain("action.shepherd.spirit-mend");
    expect(buddy?.attacks.map((a) => a.id)).toContain("action.shepherd.spirit-harm");
    expect(buddy?.resources.map((r) => r.def.id)).toContain("resource.shepherd.mend");
    // Spell access isn't a combat ability (spells have their own section).
    expect(combatFeatures(s).some((x) => x.feature.def.id === "feature.shepherd.keeper-of-life-death")).toBe(false);
  });

  it("includes Zephyr's Iron Defense and Momentum", () => {
    const s = derive(content, make("class.zephyr", { DEX: 2, STR: 2, INT: 0, WIL: -1 }));
    const names = combatFeatures(s).map((x) => x.feature.def.name);
    expect(names).toEqual(expect.arrayContaining(["Iron Defense", "Momentum"]));
  });

  it("leaves out stat increases and plain story features", () => {
    const s = derive(content, make("class.hexbinder", { INT: 2, WIL: 2, STR: 0, DEX: -1 }));
    const ids = combatFeatures(s).map((x) => x.feature.def.id);
    expect(ids).toContain("feature.hexbinder.hex");
    expect(ids.some((id) => /stat-increase/.test(id))).toBe(false);
  });
});
