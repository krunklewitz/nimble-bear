// Features that change another ability (FeatureDef.modifies) are shown with that ability on the Combat tab.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getContent } from "../../src/data/content";
import type { FeatureDefT } from "../../src/data/schema";
import { createCharacter } from "../../src/rules/build";
import { combatFeatures, reactionId, upgradesFor } from "../../src/rules/combat";
import { derive, type Sheet } from "../../src/rules/derive";
import { REACTIONS } from "../../src/rules/play";

const content = getContent();
const dir = join(__dirname, "../../src/data/content");
const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".json"));
const allIds = new Set<string>();
const features = new Map<string, FeatureDefT>();
const walk = (o: unknown): void => {
  if (Array.isArray(o)) return o.forEach(walk);
  if (!o || typeof o !== "object") return;
  const r = o as Record<string, unknown>;
  if (typeof r.id === "string") {
    allIds.add(r.id);
    if (r.id.startsWith("feature.")) features.set(r.id, r as unknown as FeatureDefT);
  }
  Object.values(r).forEach(walk);
};
for (const f of files) walk(JSON.parse(readFileSync(join(dir, f), "utf8")));
for (const w of content.weapons.keys()) allIds.add(`attack.${w}`);
for (const r of REACTIONS) allIds.add(reactionId(r));

const shepherd = () =>
  createCharacter(
    content,
    { name: "T", classId: "class.shepherd", ancestryId: "ancestry.human", ancestryChoices: {}, backgroundId: "background.acrobat", backgroundChoices: {}, statArrayId: "standard", assign: { STR: 2, DEX: 0, INT: -1, WIL: 2 }, skillPoints: { perception: 4 }, languages: [], kit: "class" },
    "t",
    "2026-11-28T00:00:00Z",
  );
/** Adds a feature to a derived sheet as if it had been gained. */
const withFeature = (sheet: Sheet, id: string, level = 3): Sheet => {
  const def = features.get(id);
  if (!def) throw new Error("no feature " + id);
  return { ...sheet, features: [...sheet.features, { def, source: "subclass", level }] };
};

describe("feature upgrades", () => {
  it("every modifies target is a real feature, spell, action, weapon attack or reaction", () => {
    const bad: string[] = [];
    for (const f of features.values()) for (const t of f.modifies ?? []) if (!allIds.has(t)) bad.push(`${f.id} → ${t}`);
    expect(bad).toEqual([]);
  });

  it("Soul Reaper changes the spirit's Harm attack, not the Lifebinding Spirit cantrip or Mend", () => {
    const s = withFeature(derive(content, shepherd()), "feature.shepherd.malice.soul-reaper");
    expect(upgradesFor(s, "action.shepherd.spirit-harm").map((f) => f.def.name)).toEqual(["Soul Reaper"]);
    expect(upgradesFor(s, "spell.shepherd.lifebinding-spirit")).toEqual([]);
    expect(upgradesFor(s, "action.shepherd.spirit-mend")).toEqual([]);
    // It's shown under Harm, so it isn't listed again as its own Class Ability.
    expect(combatFeatures(s).some((x) => x.feature.def.id === "feature.shepherd.malice.soul-reaper")).toBe(false);
  });

  it("Sneak Attack lists its upgrades, and chained upgrades come along (All In → Double or Nothing)", () => {
    const cheat = createCharacter(
      content,
      { name: "T", classId: "class.cheat", ancestryId: "ancestry.human", ancestryChoices: {}, backgroundId: "background.acrobat", backgroundChoices: {}, statArrayId: "standard", assign: { STR: 0, DEX: 2, INT: 2, WIL: -1 }, skillPoints: { perception: 4 }, languages: [], kit: "class" },
      "t",
      "2026-11-28T00:00:00Z",
    );
    let s = derive(content, cheat);
    for (const id of ["feature.cheat.sneak-attack-2", "feature.cheat.gambler.all-in", "feature.cheat.gambler.double-or-nothing"]) s = withFeature(s, id);
    expect(upgradesFor(s, "feature.cheat.sneak-attack").map((f) => f.def.name)).toEqual(["Sneak Attack (2)", "All In", "Double or Nothing!"]);
    const names = combatFeatures(s).map((x) => x.feature.def.name);
    expect(names).toContain("Sneak Attack");
    expect(names).not.toContain("Sneak Attack (2)");
    expect(names).not.toContain("Double or Nothing!");
  });
});
