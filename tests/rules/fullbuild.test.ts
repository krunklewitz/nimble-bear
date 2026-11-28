// Phase 4 gate: every class builds to level 20 with every subclass, using only legal
// choices offered by the engine. With UPDATE_REPORTS=1 it also writes docs/COVERAGE.md.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getContent, type Content } from "../../src/data/content";
import { STAT_IDS, type ClassDefT, type FeatureDefT } from "../../src/data/schema";
import { applyLevelUp, availableClasses, createCharacter, levelChoices, levelUpPlan, validateLevelUp, MAX_STAT, type LevelUpInput } from "../../src/rules/build";
import { derive } from "../../src/rules/derive";
import type { Character } from "../../src/rules/persistence/character";

const content = getContent();

function startingHero(cls: ClassDefT): Character {
  const assign = Object.fromEntries(STAT_IDS.map((s) => [s, 0])) as Record<string, number>;
  assign[cls.keyStats[0]] = 2;
  assign[cls.keyStats[1]] = 2;
  const others = STAT_IDS.filter((s) => !cls.keyStats.includes(s));
  assign[others[0] as string] = 0;
  assign[others[1] as string] = -1;
  return createCharacter(
    content,
    {
      name: `Test ${cls.name}`,
      classId: cls.id,
      ancestryId: "ancestry.human",
      ancestryChoices: {},
      backgroundId: "background.acrobat",
      backgroundChoices: {},
      statArrayId: "standard",
      assign,
      skillPoints: { perception: 4 },
      languages: [],
      kit: "class",
    },
    "hero",
    "2026-11-28T00:00:00Z",
  );
}

/** Levels a hero to 20, choosing `subclassId` and otherwise the first legal options. Returns problems per level. */
function buildTo20(c: Character, subclassId: string): string[] {
  const problems: string[] = [];
  for (let lvl = 2; lvl <= 20; lvl++) {
    const sheet = derive(content, c);
    const plan = levelUpPlan(content, c, sheet);
    if (!plan) {
      problems.push(`No level-up plan at level ${lvl}`);
      break;
    }
    const choices: Record<string, string[]> = {};
    // Answer choices as they appear (a chosen option can open a new choice), like the wizard does.
    for (let round = 0; round < 5; round++) {
      const open = levelChoices(content, c, plan, choices).filter((pc) => (choices[pc.choice.id] ?? []).length < pc.choice.count);
      if (open.length === 0) break;
      for (const { choice } of open) {
      // Ask the engine which options are legal right now (as the wizard does).
      const trial = structuredClone(c);
      trial.build.levels.push({ level: plan.level, classId: c.build.levels[0]?.classId ?? "", hp: { method: "average", value: 0 }, skillPoints: {}, choices });
      const pc = derive(content, trial).choices.find((x) => x.choice.id === choice.id);
      let opts = pc?.options.map((o) => o.id) ?? [];
      if (choice.from.kind === "subclass") opts = [subclassId];
      if (choice.from.kind === "stat") {
        // Prefer stats furthest below the +5 cap.
        const now = derive(content, trial).stats;
        opts = [...opts].filter((s) => now[s as "STR"] < MAX_STAT).sort((a, b) => now[a as "STR"] - now[b as "STR"]);
      }
      if (choice.from.kind === "text") opts = ["test"];
      choices[choice.id] = opts.slice(0, choice.count);
      }
    }
    const input: LevelUpInput = { hp: plan.average !== null ? { method: "average", value: plan.average } : { method: "roll", value: 1 }, addSkill: "perception", choices };
    const errs = validateLevelUp(content, c, plan, input, sheet);
    if (errs.length) problems.push(`Level ${lvl}: ${errs.join(" | ")}`);
    applyLevelUp(content, c, plan, input);
  }
  return problems;
}

const classes = availableClasses(content);
const complete = (cls: ClassDefT) => Array.from({ length: 20 }, (_, i) => String(i + 1)).every((l) => l in cls.levels);

describe("every class builds to level 20 with every subclass (Phase 4 gate)", () => {
  for (const cls of classes) {
    const subs = [...content.subclasses.values()].filter((s) => s.classId === cls.id);
    it(`${cls.name} has a level table for 1–20`, () => {
      expect(complete(cls), `${cls.name} levels present: ${Object.keys(cls.levels).join(",")}`).toBe(true);
    });
    for (const sub of subs) {
      it(`${cls.name} / ${sub.name} reaches level 20 with only legal choices`, () => {
        if (!complete(cls)) return; // reported by the table test
        const c = startingHero(cls);
        const problems = buildTo20(c, sub.id);
        expect(problems).toEqual([]);
        const sheet = derive(content, c);
        expect(sheet.level).toBe(20);
        expect(sheet.warnings).toEqual([]);
        const unanswered = sheet.choices.filter((x) => typeof x.where === "number" && x.choice.from.kind !== "save" && x.selected.length < x.choice.count);
        expect(unanswered.map((x) => x.choice.id)).toEqual([]);
        for (const s of STAT_IDS) expect(sheet.stats[s]).toBeLessThanOrEqual(MAX_STAT);
        // Every subclass feature for levels 1–20 is active.
        for (const [lvl, ids] of Object.entries(sub.levels)) for (const id of ids) expect(sheet.features.some((f) => f.def.id === id), `${id} (level ${lvl})`).toBe(true);
      });
    }
  }
});

function coverage(c: Content): string {
  const lines = ["# Class coverage report", "", "Generated by `UPDATE_REPORTS=1 npx vitest run tests/rules/fullbuild.test.ts`. Full = the sheet handles it; Partly/By hand = shown with manual controls (details in AUTOMATION.md).", ""];
  const count = (feats: FeatureDefT[]) => {
    const full = feats.filter((f) => f.automation === "full").length;
    const partial = feats.filter((f) => f.automation === "partial").length;
    const manual = feats.filter((f) => f.automation === "manual").length;
    return `${feats.length} (full ${full}, partly ${partial}, by hand ${manual})`;
  };
  for (const cls of availableClasses(c)) {
    const subs = [...c.subclasses.values()].filter((s) => s.classId === cls.id);
    lines.push(`## ${cls.name} (${cls.source.file}, ${cls.source.version})`, "");
    lines.push(`- Levels with a table entry: ${Object.keys(cls.levels).length}/20`);
    lines.push(`- Class features: ${count(cls.features)}`);
    for (const [pool, opts] of Object.entries(cls.optionPools)) lines.push(`- Pool \`${pool}\`: ${count(opts)}`);
    for (const s of subs) {
      lines.push(`- Subclass ${s.name}${s.storyBased ? " (story-based)" : ""}: levels ${Object.keys(s.levels).join(", ")}; features ${count(s.features)}`);
      for (const [pool, opts] of Object.entries(s.optionPools ?? {})) lines.push(`  - Pool \`${pool}\`: ${count(opts)}`);
    }
    lines.push("", "| Level | Features |", "|---|---|");
    for (let l = 1; l <= 20; l++) {
      const names = (cls.levels[String(l)] ?? []).map((id) => cls.features.find((f) => f.id === id)?.name ?? `⚠ ${id}`);
      lines.push(`| ${l} | ${names.join(", ") || "—"} |`);
    }
    lines.push("");
  }
  const spellsBySchool = new Map<string, number>();
  for (const s of c.spells.values()) spellsBySchool.set(s.school, (spellsBySchool.get(s.school) ?? 0) + 1);
  lines.push("## Spells", "", ...[...spellsBySchool].map(([k, v]) => `- ${k}: ${v}`), "");
  lines.push("## Boons", "", ...["boons.minor", "boons.major", "boons.epic"].map((p) => `- ${p}: ${(c.pools.get(p) ?? []).length}`), "");
  return lines.join("\n");
}

it("writes the coverage report when asked", () => {
  if (process.env["UPDATE_REPORTS"] !== "1") return;
  writeFileSync(join(__dirname, "..", "..", "docs", "COVERAGE.md"), coverage(content));
});
