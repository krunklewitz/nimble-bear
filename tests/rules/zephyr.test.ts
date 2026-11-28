import { describe, expect, it } from "vitest";
import { getContent } from "../../src/data/content";
import { applyLevelUp, createCharacter, levelChoices, levelUpPlan } from "../../src/rules/build";
import { derive } from "../../src/rules/derive";
import type { Character } from "../../src/rules/persistence/character";
import { applyDamage, setResource, startCombat } from "../../src/rules/play";

const content = getContent();

function zephyr(level: number, subclass = "subclass.zephyr.pain", str = 2): Character {
  const assign = { DEX: 2, STR: str, INT: str === 2 ? 0 : 2, WIL: -1 };
  const c = createCharacter(
    content,
    { name: "Z", classId: "class.zephyr", ancestryId: "ancestry.human", ancestryChoices: {}, backgroundId: "background.acrobat", backgroundChoices: {}, statArrayId: "standard", assign, skillPoints: { might: 4 }, languages: [], kit: "class" },
    "z",
    "2026-11-28T00:00:00Z",
  );
  for (let l = 2; l <= level; l++) {
    const plan = levelUpPlan(content, c);
    if (!plan) throw new Error("no plan");
    const choices: Record<string, string[]> = {};
    for (let round = 0; round < 4; round++) {
      for (const pc of levelChoices(content, c, plan, choices)) {
        if ((choices[pc.choice.id] ?? []).length) continue;
        choices[pc.choice.id] = pc.choice.from.kind === "subclass" ? [subclass] : pc.options.slice(0, pc.choice.count).map((o) => o.id);
      }
    }
    applyLevelUp(content, c, plan, { hp: { method: "average", value: plan.average ?? 1 }, addSkill: "might", choices });
  }
  return c;
}

describe("Zephyr review fixes", () => {
  it("lets Bursts of Speed go above DEX (Reactive Force adds one)", () => {
    const c = zephyr(4);
    const s = derive(content, c);
    startCombat(c, s, content.core, 12, 10);
    const dex = s.stats.DEX;
    expect(c.play.resources["resource.zephyr.burst-of-speed"]?.current).toBe(dex);
    setResource(c, s, "resource.zephyr.burst-of-speed", dex + 1);
    expect(c.play.resources["resource.zephyr.burst-of-speed"]?.current).toBe(dex + 1);
  });

  it("Way of Pain: taking damage no longer empties Momentum", () => {
    const pain = zephyr(3, "subclass.zephyr.pain");
    pain.play.resources["resource.zephyr.momentum"] = { current: 5 };
    applyDamage(pain, derive(content, pain), 3);
    expect(pain.play.resources["resource.zephyr.momentum"]?.current).toBe(5);

    const iron = zephyr(3, "subclass.zephyr.iron");
    iron.play.resources["resource.zephyr.momentum"] = { current: 5 };
    applyDamage(iron, derive(content, iron), 3);
    expect(iron.play.resources["resource.zephyr.momentum"]?.current).toBe(0);
  });

  it("Iron Defense (2) uses (3×STR)+DEX even when that is lower", () => {
    const c = zephyr(5, "subclass.zephyr.iron", 0);
    c.play.inventory = c.play.inventory.filter((i) => !content.armor.has(i.itemId ?? ""));
    const s = derive(content, c);
    expect(s.defense.value).toBe(3 * s.stats.STR + s.stats.DEX);
    expect(s.actions.find((a) => a.id === "attack.weapon.unarmed-strike")?.roll?.canCrit).toBe(true);
  });
});

describe("Momentum starts empty, capped at 30 (table rule)", () => {
  it("a new Zephyr has 0 Momentum (and 0 Bursts after levelling up) before combat", () => {
    const s = derive(content, zephyr(2));
    const m = s.resources.find((r) => r.def.id === "resource.zephyr.momentum");
    expect(m?.current).toBe(0);
    expect(m?.max).toBe(30);
    expect(s.resources.find((r) => r.def.id === "resource.zephyr.burst-of-speed")?.current).toBe(0);
  });

  it("Momentum can't go above 30", () => {
    const c = zephyr(1);
    setResource(c, derive(content, c), "resource.zephyr.momentum", 45);
    expect(derive(content, c).resources.find((r) => r.def.id === "resource.zephyr.momentum")?.current).toBe(30);
  });

  it("an old save holding 99 shows 30", () => {
    const c = zephyr(1);
    c.play.resources["resource.zephyr.momentum"] = { current: 99 };
    expect(derive(content, c).resources.find((r) => r.def.id === "resource.zephyr.momentum")?.current).toBe(30);
  });
});
