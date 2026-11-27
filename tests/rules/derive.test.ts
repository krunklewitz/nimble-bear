// Acceptance tests: the books' own quick builds must derive to the printed numbers.
// The Cheat "Stabs!" (TheCheat3.0.pdf PDF 9, printed 16) and Shepherd "Grace" (Shepherd3.0.pdf PDF 9, printed 16).
import { describe, expect, it } from "vitest";
import { getContent } from "../../src/data/content";
import { derive, type Sheet } from "../../src/rules/derive";
import { newCharacter, type Character, type LevelRecord } from "../../src/rules/persistence/character";

const content = getContent();

function hero(opts: {
  classId: string;
  ancestry: string;
  ancestryChoices?: Record<string, string[]>;
  assign: Record<string, number>;
  levels: Omit<LevelRecord, "classId">[];
  items: { id: string; qty?: number; equipped?: boolean }[];
}): Character {
  const c = newCharacter("test", "Test", "2026-11-27T00:00:00Z");
  c.build.stats = { method: "standard", assign: opts.assign };
  c.build.ancestry = { id: opts.ancestry, choices: opts.ancestryChoices ?? {} };
  c.build.levels = opts.levels.map((l) => ({ ...l, classId: opts.classId }));
  c.play.inventory = opts.items.map((i) => ({ itemId: i.id, name: i.id, qty: i.qty ?? 1, equipped: i.equipped ?? false, notes: "" }));
  return c;
}

const skillMap = (s: Sheet) => Object.fromEntries(s.skills.map((k) => [k.id, k.total]));

describe("The Cheat quick build: Stabs! (Kobold)", () => {
  const level1: Omit<LevelRecord, "classId"> = { level: 1, hp: { method: "starting", value: 10 }, skillPoints: { finesse: 1, influence: 1, stealth: 2 }, choices: {} };
  const items = [
    { id: "weapon.dagger", qty: 2, equipped: true },
    { id: "weapon.sling" },
    { id: "armor.cheap-hides", equipped: true },
    { id: "gear.chalk" },
  ];
  const assign = { STR: -1, DEX: 2, INT: 2, WIL: 0 };

  it("level 1 matches the printed sheet", () => {
    const s = derive(content, hero({ classId: "class.cheat", ancestry: "ancestry.kobold", assign, levels: [level1], items }));
    expect(s.warnings).toEqual([]);
    expect(s.hp.max).toBe(10);
    expect(s.defense.value).toBe(5);
    expect(s.initiative.mod).toBe(2);
    expect(s.hitDice).toMatchObject({ die: "d6", max: 1 });
    expect(s.wounds.max).toBe(6);
    expect(s.speed).toBe(6);
    expect(s.size).toBe("small");
    expect(skillMap(s)).toEqual({ arcana: 2, examination: 2, finesse: 3, influence: 1, insight: 0, lore: 2, might: -1, naturecraft: 0, perception: 0, stealth: 4 });
    expect(s.saves.DEX.advantage).toBe(1);
    expect(s.saves.WIL.advantage).toBe(-1);
    expect(s.saveDc).toBe(12);
    expect(s.vars["sneakAttack"]).toBe("1d6");
    // "Daggers (2). (1d4+2) Thrown 4" and "Sling. (1d4+2) Range 12, Vicious"
    const dagger = s.actions.find((a) => a.id === "attack.weapon.dagger");
    expect(dagger?.roll?.formula).toBe("1d4+DEX");
    expect(dagger?.roll?.dice.flat).toBe(2);
    expect(dagger?.roll?.canCrit).toBe(true);
    const sling = s.actions.find((a) => a.id === "attack.weapon.sling");
    expect(sling?.roll?.vicious).toBe(true);
    expect(s.languages).toContain("draconic");
    expect(s.features.map((f) => f.def.name)).toEqual(expect.arrayContaining(["Sneak Attack", "Vicious Opportunist", "Wily"]));
  });

  it("level 2 matches the printed sheet (average HP, +1 Stealth, Arcana → Finesse)", () => {
    const level2: Omit<LevelRecord, "classId"> = { level: 2, hp: { method: "average", value: 4 }, skillPoints: { stealth: 1, arcana: -1, finesse: 1 }, choices: {} };
    const s = derive(content, hero({ classId: "class.cheat", ancestry: "ancestry.kobold", assign, levels: [level1, level2], items }));
    expect(s.hp.max).toBe(14);
    expect(s.hitDice.max).toBe(2);
    expect(skillMap(s)).toEqual({ arcana: 1, examination: 2, finesse: 4, influence: 1, insight: 0, lore: 2, might: -1, naturecraft: 0, perception: 0, stealth: 5 });
    expect(s.features.map((f) => f.def.name)).toContain("Cheat");
    // Cheat: "If you roll less than 10 on Initiative, you may change it to 10 instead."
    expect(s.rollOptions.some((o) => o.on === "initiative" && o.change === "floor")).toBe(true);
  });

  it("Sneak Attack becomes 1d8 at level 3, and Honorseeker keeps that scaling for Tenacious Fighter", () => {
    const l2: Omit<LevelRecord, "classId"> = { level: 2, hp: { method: "average", value: 4 }, skillPoints: { stealth: 1 }, choices: {} };
    const l3 = (sub: string): Omit<LevelRecord, "classId"> => ({ level: 3, hp: { method: "average", value: 4 }, skillPoints: { stealth: 1 }, choices: { "choice.cheat.subclass": [sub] } });
    const blade = derive(content, hero({ classId: "class.cheat", ancestry: "ancestry.kobold", assign, levels: [level1, l2, l3("subclass.cheat.silent-blade")], items }));
    expect(blade.vars["sneakAttack"]).toBe("1d8");
    expect(blade.subclass?.name).toBe("Tools of the Silent Blade");
    expect(blade.languages).toContain("thieves-cant");

    const honor = derive(content, hero({ classId: "class.cheat", ancestry: "ancestry.kobold", assign, levels: [level1, l2, l3("subclass.cheat.honorseeker")], items }));
    expect(honor.vars["sneakAttack"]).toBe("1d8");
    expect(honor.features.find((f) => f.def.id === "feature.cheat.sneak-attack")?.replacedBy).toBe("feature.cheat.honorseeker.honorseeker");
    expect(honor.rollOptions.some((o) => o.id === "roll.cheat.sneak-attack")).toBe(false);
  });
});

describe("Shepherd quick build: Grace (Human)", () => {
  const level1: Omit<LevelRecord, "classId"> = { level: 1, hp: { method: "starting", value: 17 }, skillPoints: { influence: 2, insight: 1, perception: 1 }, choices: {} };
  const items = [
    { id: "weapon.club-mace", equipped: true },
    { id: "armor.rusty-mail", equipped: true },
    { id: "shield.wooden-buckler", equipped: true },
    { id: "gear.bell" },
  ];
  const assign = { STR: 2, DEX: 0, INT: -1, WIL: 2 };

  it("level 1 matches the printed sheet", () => {
    const s = derive(content, hero({ classId: "class.shepherd", ancestry: "ancestry.human", assign, levels: [level1], items }));
    expect(s.warnings).toEqual([]);
    expect(s.hp.max).toBe(17);
    expect(s.defense.value).toBe(8); // Rusty Mail 6+DEX + Wooden Buckler 2
    expect(s.initiative.mod).toBe(1); // DEX 0 + Tenacious
    expect(s.hitDice).toMatchObject({ die: "d10", max: 1 });
    expect(skillMap(s)).toEqual({ arcana: 0, examination: 0, finesse: 1, influence: 5, insight: 4, lore: 0, might: 3, naturecraft: 3, perception: 4, stealth: 1 });
    // "Harm. 1 Action: (Reach 4) attack for 1d8+2 (ignoring Armor)."; "Mend. (2/Safe Rest, Reach 4) restore 2d20 HP"
    const harm = s.actions.find((a) => a.id === "action.shepherd.spirit-harm");
    expect(harm?.roll?.dice).toEqual({ groups: [{ count: 1, sides: 8, tens: false }], flat: 2 });
    expect(harm?.roll?.ignoresArmor).toBe(true);
    const mend = s.actions.find((a) => a.id === "action.shepherd.spirit-mend");
    expect(mend?.roll?.dice.groups).toEqual([{ count: 2, sides: 20, tens: false }]);
    expect(s.resources.find((r) => r.def.id === "resource.shepherd.mend")?.max).toBe(2);
    expect(s.mana).toBeUndefined();
    expect(s.spells.maxTier).toBe(0);
    expect(s.spells.known.map((k) => k.def.id)).toEqual(expect.arrayContaining(["spell.radiant.rebuke", "spell.shepherd.lifebinding-spirit"]));
    expect(s.spells.known.every((k) => k.def.tier === 0)).toBe(true);
    const mace = s.actions.find((a) => a.id === "attack.weapon.club-mace");
    expect(mace?.roll?.dice.flat).toBe(2); // "Mace. (1d6+2)"
  });

  it("level 2 matches the printed sheet (24 HP, 8 mana, tier 1 spells)", () => {
    const level2: Omit<LevelRecord, "classId"> = { level: 2, hp: { method: "average", value: 7 }, skillPoints: { examination: 1, naturecraft: -1, insight: 1 }, choices: {} };
    const s = derive(content, hero({ classId: "class.shepherd", ancestry: "ancestry.human", assign, levels: [level1, level2], items }));
    expect(s.hp.max).toBe(24);
    expect(s.mana?.max).toBe(8);
    expect(skillMap(s)).toEqual({ arcana: 0, examination: 1, finesse: 1, influence: 5, insight: 5, lore: 0, might: 3, naturecraft: 2, perception: 4, stealth: 1 });
    expect(s.spells.maxTier).toBe(1);
    expect(s.spells.known.some((k) => k.def.id === "spell.radiant.heal")).toBe(true);
  });

  it("Forge swaps Necrotic for Fire, including Master of Twilight's utility pick (RQ-011)", () => {
    const l2: Omit<LevelRecord, "classId"> = { level: 2, hp: { method: "average", value: 7 }, skillPoints: { insight: 1 }, choices: {} };
    const l3: Omit<LevelRecord, "classId"> = { level: 3, hp: { method: "average", value: 7 }, skillPoints: { insight: 1 }, choices: { "choice.shepherd.subclass": ["subclass.shepherd.forge"] } };
    const s = derive(content, hero({ classId: "class.shepherd", ancestry: "ancestry.human", assign, levels: [level1, l2, l3], items }));
    expect(s.spells.schools).toEqual(["fire", "radiant"]);
    const necroPick = s.choices.find((c) => c.choice.id === "choice.shepherd.master-of-twilight-necrotic");
    expect(necroPick?.options.length).toBeGreaterThan(0);
    expect(necroPick?.options.every((o) => o.id.startsWith("spell.fire."))).toBe(true);
  });
});

describe("derivation details", () => {
  it("lets players override derived values", () => {
    const c = hero({ classId: "class.cheat", ancestry: "ancestry.human", assign: { STR: 0, DEX: 2, INT: 2, WIL: -1 }, levels: [{ level: 1, hp: { method: "starting", value: 10 }, skillPoints: {}, choices: {} }], items: [] });
    c.overrides = { defense: 12 };
    const s = derive(content, c);
    expect(s.defense.value).toBe(12);
    expect(s.overridden).toContain("defense");
  });

  it("auto-resolves a save choice with only one possible save (Celestial Highborn)", () => {
    const c = hero({ classId: "class.cheat", ancestry: "ancestry.celestial", assign: { STR: 0, DEX: 2, INT: 2, WIL: -1 }, levels: [{ level: 1, hp: { method: "starting", value: 10 }, skillPoints: {}, choices: {} }], items: [] });
    const s = derive(content, c);
    expect(s.saves.WIL.advantage).toBe(0);
  });

  it("uses unarmored Defense (DEX) with no armor", () => {
    const c = hero({ classId: "class.cheat", ancestry: "ancestry.human", assign: { STR: 0, DEX: 2, INT: 2, WIL: -1 }, levels: [{ level: 1, hp: { method: "starting", value: 10 }, skillPoints: {}, choices: {} }], items: [] });
    expect(derive(content, c).defense.value).toBe(2);
  });
});
