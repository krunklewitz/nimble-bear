import { describe, expect, it } from "vitest";
import { getContent } from "../../src/data/content";
import { createCharacter } from "../../src/rules/build";
import { derive } from "../../src/rules/derive";
import { itemInfo } from "../../src/rules/items";

const content = getContent();
const grace = createCharacter(
  content,
  {
    name: "Grace",
    classId: "class.shepherd",
    ancestryId: "ancestry.human",
    ancestryChoices: {},
    backgroundId: "background.wild-one",
    backgroundChoices: {},
    statArrayId: "standard",
    assign: { STR: 2, DEX: 0, INT: -1, WIL: 2 },
    skillPoints: { influence: 2, insight: 1, perception: 1 },
    languages: [],
    kit: "class",
  },
  "g",
  "2026-11-27T00:00:00Z",
);
const sheet = derive(content, grace);
const ruleIds = (id: string) => itemInfo(content, id, id, sheet).rules.map((r) => r.id);

describe("item rules", () => {
  it("Rusty Mail shows its Defense, proficiency and the armor rules", () => {
    const info = itemInfo(content, "armor.rusty-mail", "Rusty Mail", sheet);
    expect(info.facts.join(" ")).toMatch(/Defense 6\+DEX \(max 2\)/);
    expect(info.facts.join(" ")).toMatch(/proficient with mail/);
    expect(ruleIds("armor.rusty-mail")).toEqual(expect.arrayContaining(["rule.armor.defense", "rule.armor.defend", "rule.armor.equipment-proficiency"]));
  });

  it("a shield shows its bonus, the shield rules and the optional Deflect!", () => {
    const info = itemInfo(content, "shield.wooden-buckler", "Wooden Buckler", sheet);
    expect(info.facts[0]).toBe("+2 Defense while equipped.");
    const deflect = info.rules.find((r) => r.id === "rule.shield.deflect");
    expect(deflect?.optional).toBe(true);
  });

  it("weapons show the rules for their properties", () => {
    expect(ruleIds("weapon.sling")).toEqual(expect.arrayContaining(["rule.weapon-property.two-handed", "rule.weapon-property.range", "rule.weapon-property.vicious"]));
    expect(ruleIds("weapon.dagger")).toContain("rule.weapon-property.thrown");
    expect(ruleIds("weapon.dagger")).not.toContain("rule.weapon-property.two-handed");
    expect(itemInfo(content, "weapon.club-mace", "Mace", sheet).facts.join(" ")).toMatch(/You roll 1d6\+STR \(\+2\)/);
  });

  it("warns about unmet STR requirements and missing proficiency", () => {
    expect(itemInfo(content, "armor.full-plate", "Full Plate", sheet).warnings.join(" ")).toMatch(/Requires 4 STR/);
    expect(itemInfo(content, "armor.cheap-hides", "Cheap Hides", sheet).warnings.join(" ")).toMatch(/Not proficient/);
  });

  it("gear shows its book description", () => {
    const potion = [...content.gear.values()].find((g) => /potion/i.test(g.id));
    if (!potion) throw new Error("no potion");
    const info = itemInfo(content, potion.id, potion.name, sheet);
    expect(info.facts[0]).toBe(potion.text);
  });
});
