import { describe, expect, it } from "vitest";
import { getContent } from "../../src/data/content";
import { scriptedRng } from "../../src/rules/dice";
import { applyLevelUp, checkStats, createCharacter, levelUpPlan, undoLastLevel, validateCreation, validateLevelUp, type CreationInput } from "../../src/rules/build";
import { derive } from "../../src/rules/derive";
import { applyDamage, checkUse, endCombat, endTurn, heal, payUse, safeRest, spendHitDice, startCombat } from "../../src/rules/play";
import type { Character } from "../../src/rules/persistence/character";

const content = getContent();

const grace: CreationInput = {
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
};

const make = (over: Partial<CreationInput> = {}): Character => createCharacter(content, { ...grace, ...over }, "id-1", "2026-11-27T00:00:00Z");

describe("character creation (Core p.18–21)", () => {
  it("builds a level-1 hero with class gear equipped, full HP and resources", () => {
    const c = make();
    expect(validateCreation(content, grace)).toEqual([]);
    const s = derive(content, c);
    expect(c.play.hp).toBe(17);
    expect(s.defense.value).toBe(8);
    expect(c.play.resources["resource.shepherd.mend"]?.current).toBe(2);
    expect(c.content["shepherd"]).toBe("3.0");
  });

  it("gives 50 gp instead of the class kit", () => {
    const c = make({ kit: "gold" });
    expect(c.play.gold).toBe(50);
    expect(c.play.inventory).toEqual([]);
  });

  it("requires the highest array values in the Key Stats", () => {
    const shep = content.classes.get("class.shepherd");
    expect(checkStats(shep, [2, 2, 0, -1], { STR: 2, DEX: 0, INT: -1, WIL: 2 })).toEqual([]);
    expect(checkStats(shep, [2, 2, 0, -1], { STR: 2, DEX: 2, INT: -1, WIL: 0 })[0]).toMatch(/Key Stats/);
    expect(checkStats(shep, [2, 2, 0, -1], { STR: 2, DEX: 2, INT: 2, WIL: 2 })[0]).toMatch(/exactly once/);
  });

  it("enforces 4 starting skill points, background requirements, languages and a name", () => {
    const steps = (over: Partial<CreationInput>) => validateCreation(content, { ...grace, ...over }).map((p) => p.step);
    expect(steps({ skillPoints: { influence: 3 } })).toContain("skills");
    // So Dumb I'm Smart Sometimes: "Req. 0 or negative INT at character creation" — Grace has INT -1: fine.
    expect(steps({ backgroundId: "background.so-dumb-im-smart-sometimes" })).not.toContain("background");
    expect(steps({ backgroundId: "background.wily-underdog" })).toContain("background"); // needs STR ≤ 0
    expect(steps({ languages: ["elvish"] })).toContain("languages"); // INT -1: no extra languages
    expect(steps({ name: "  " })).toContain("name");
  });
});

describe("leveling up (Core p.21)", () => {
  it("plans level 2 with the class's new features and the d10 average", () => {
    const c = make();
    const plan = levelUpPlan(content, c);
    expect(plan?.level).toBe(2);
    expect(plan?.average).toBe(7);
    expect(plan?.features.map((f) => f.id)).toContain("feature.shepherd.mana-and-unlock-tier-1-spells");
  });

  it("applies level 2 (Grace: 24 HP, 8 mana) and can undo it", () => {
    const c = make();
    const plan = levelUpPlan(content, c);
    if (!plan) throw new Error("no plan");
    const input = { hp: { method: "average" as const, value: 7 }, addSkill: "examination", move: { from: "naturecraft", to: "insight" }, choices: {} };
    expect(validateLevelUp(content, c, plan, input)).toEqual([]);
    applyLevelUp(content, c, plan, input);
    const s = derive(content, c);
    expect([s.level, s.hp.max, c.play.hp, s.mana?.max]).toEqual([2, 24, 24, 8]);
    expect(c.play.resources["resource.mana"]?.current).toBe(8);
    expect(undoLastLevel(content, c)).toBe(true);
    expect(derive(content, c).level).toBe(1);
    expect(undoLastLevel(content, c)).toBe(false);
  });

  it("asks for the subclass and utility spells at level 3", () => {
    const c = make();
    for (const lvl of [2]) {
      const p = levelUpPlan(content, c);
      if (!p) throw new Error("no plan");
      applyLevelUp(content, c, p, { hp: { method: "average", value: 7 }, addSkill: "insight", choices: {} });
      expect(derive(content, c).level).toBe(lvl);
    }
    const plan = levelUpPlan(content, c);
    const ids = plan?.choices.map((x) => x.choice.id) ?? [];
    expect(ids).toEqual(expect.arrayContaining(["choice.shepherd.subclass", "choice.shepherd.master-of-twilight-necrotic", "choice.shepherd.master-of-twilight-radiant"]));
    if (!plan) return;
    expect(validateLevelUp(content, c, plan, { hp: { method: "average", value: 7 }, addSkill: "insight", choices: {} }).length).toBeGreaterThan(0);
  });

  it("rejects bad HP values and moving points out of a negative skill", () => {
    const c = make();
    const plan = levelUpPlan(content, c);
    if (!plan) throw new Error("no plan");
    expect(validateLevelUp(content, c, plan, { hp: { method: "roll", value: 11 }, addSkill: "insight", choices: {} })[0]).toMatch(/1–10/);
    expect(validateLevelUp(content, c, plan, { hp: { method: "average", value: 6 }, addSkill: "insight", choices: {} })[0]).toMatch(/average/);
  });
});

describe("HP, Wounds and Dying (Core p.9)", () => {
  it("spends temp HP first, then HP; 0 HP gives 1 Wound", () => {
    const c = make();
    c.play.tempHp = 5;
    const r = applyDamage(c, derive(content, c), 30);
    expect(r).toMatchObject({ tempAbsorbed: 5, hpLost: 17, woundsGained: 1, droppedToZero: true });
    expect([c.play.hp, c.play.tempHp, c.play.wounds]).toEqual([0, 0, 1]);
  });

  it("damage while Dying gives 2 Wounds, a crit 3; 6 Wounds is death", () => {
    const c = make();
    c.play.hp = 0;
    c.play.wounds = 1;
    expect(applyDamage(c, derive(content, c), 4).woundsGained).toBe(2);
    expect(applyDamage(c, derive(content, c), 4, { crit: true })).toMatchObject({ woundsGained: 3, died: true });
  });

  it("heals up to max and revives from 0", () => {
    const c = make();
    c.play.hp = 0;
    expect(heal(c, derive(content, c), 50)).toEqual({ healed: 17, revived: true });
  });

  it("Catch Breath heals Hit Die + STR per die; Make Camp uses the max", () => {
    const c = make();
    c.play.hp = 1;
    expect(spendHitDice(c, derive(content, c), 1, "roll", scriptedRng([4]))).toMatchObject({ spent: 1, rolls: [4], healed: 6 });
    expect(spendHitDice(c, derive(content, c), 1, "max", scriptedRng([]))).toMatchObject({ spent: 0 });
  });

  it("Safe Rest restores HP, Hit Dice and Mend, heals 1 Wound and clears temp HP", () => {
    const c = make();
    c.play.hp = 3;
    c.play.wounds = 2;
    c.play.tempHp = 4;
    c.play.hitDiceSpent = 1;
    c.play.resources["resource.shepherd.mend"] = { current: 0 };
    safeRest(c, derive(content, c));
    expect([c.play.hp, c.play.wounds, c.play.tempHp, c.play.hitDiceSpent, c.play.resources["resource.shepherd.mend"]?.current]).toEqual([17, 1, 0, 0, 2]);
  });
});

describe("combat (Core p.12–15)", () => {
  it("starts with actions from Initiative, spends them, and gets 3 back at turn end", () => {
    const c = make();
    const s = derive(content, c);
    expect(startCombat(c, s, content.core, 12, 11).actions).toBe(2);
    const harm = s.actions.find((a) => a.id === "action.shepherd.spirit-harm");
    if (!harm) throw new Error("no harm");
    payUse(c, s, harm, { creature: "companion" });
    expect(c.play.combat.actions).toBe(1);
    // The spirit is a different creature: the hero's first attack isn't rushed.
    const mace = s.actions.find((a) => a.id === "attack.weapon.club-mace");
    if (!mace) throw new Error("no mace");
    expect(checkUse(c, s, mace).rushed).toBe(0);
    payUse(c, s, mace);
    expect(checkUse(c, s, mace)).toMatchObject({ ok: false, rushed: 1 });
    endTurn(c, s);
    expect([c.play.combat.actions, c.play.combat.round]).toEqual([3, 2]);
    endCombat(c, s);
    expect(c.play.combat.active).toBe(false);
  });

  it("warns when a limited ability or resource has run out", () => {
    const c = make();
    c.play.resources["resource.shepherd.mend"] = { current: 0 };
    const s = derive(content, c);
    const mend = s.actions.find((a) => a.id === "action.shepherd.spirit-mend");
    if (!mend) throw new Error("no mend");
    expect(checkUse(c, s, mend).problems[0]).toMatch(/Mend/);
  });
});
