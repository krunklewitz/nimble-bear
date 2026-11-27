// Character creation and level-up rules (Core Rules 3.2 p.18–21, Glossary p.56).
// Pure functions: the wizards call these to offer only legal choices and to validate.
import type { Content } from "../data/content";
import type { ChoiceDefT, ClassDefT, FeatureDefT, StatId } from "../data/schema";
import { STAT_IDS } from "../data/schema";
import { derive, type Sheet } from "./derive";
import { newCharacter, type Character, type LevelRecord } from "./persistence/character";

/** The character classes a player may pick (decision: only classes whose books are in reference/). */
export const availableClasses = (content: Content): ClassDefT[] => [...content.classes.values()].sort((a, b) => a.name.localeCompare(b.name));

export interface CreationInput {
  name: string;
  classId: string;
  ancestryId: string;
  ancestryChoices: Record<string, string[]>;
  backgroundId: string;
  backgroundChoices: Record<string, string[]>;
  statArrayId: string;
  assign: Partial<Record<StatId, number>>;
  /** The 4 starting skill points (Glossary p.56). */
  skillPoints: Record<string, number>;
  languages: string[];
  /** Class starting gear, or 50 gp (p.20). */
  kit: "class" | "gold";
}

export interface Problem {
  step: "class" | "ancestry" | "background" | "stats" | "skills" | "languages" | "equipment" | "name";
  message: string;
}

/** Stat assignments that follow the chosen array with the highest values in the Key Stats (p.20). */
export function checkStats(cls: ClassDefT | undefined, values: readonly number[] | undefined, assign: Partial<Record<StatId, number>>): string[] {
  if (!cls || !values) return ["Choose a class and a stat array first."];
  const given = STAT_IDS.map((s) => assign[s]);
  if (given.some((v) => v === undefined)) return ["Assign a value to every stat."];
  const sorted = [...values].sort((a, b) => b - a);
  if ([...(given as number[])].sort((a, b) => b - a).join() !== sorted.join()) return ["Use each value of the array exactly once."];
  const keyValues = cls.keyStats.map((s) => assign[s] as number).sort((a, b) => b - a);
  if (keyValues.join() !== sorted.slice(0, 2).join()) return [`Put the two highest values in your Key Stats (${cls.keyStats.join(" and ")}).`];
  return [];
}

export function checkStartingSkills(content: Content, points: Record<string, number>): string[] {
  const total = Object.values(points).reduce((s, v) => s + v, 0);
  const problems: string[] = [];
  const valid = new Set(content.core.skills.map((s) => s.id));
  for (const [k, v] of Object.entries(points)) {
    if (!valid.has(k)) problems.push(`Unknown skill ${k}.`);
    if (v < 0 || !Number.isInteger(v)) problems.push("Starting skill points can't be negative.");
  }
  const want = content.core.defaults.startingSkillPoints;
  if (total !== want) problems.push(`Spend exactly ${want} skill points (${total} spent).`);
  return problems;
}

/** Choices a feature list asks for (with the effects nested in chosen options). */
export function choicesIn(features: FeatureDefT[]): { choice: ChoiceDefT; featureId: string }[] {
  const out: { choice: ChoiceDefT; featureId: string }[] = [];
  for (const f of features) for (const e of f.effects) if (e.type === "choice") out.push({ choice: e.choice, featureId: f.id });
  return out;
}

/** Builds a level-1 character from the wizard's input (doesn't validate; see validateCreation). */
export function createCharacter(content: Content, input: CreationInput, id: string, now: string): Character {
  const c = newCharacter(id, input.name.trim() || "Unnamed hero", now);
  const cls = content.classes.get(input.classId);
  const array = content.core.statArrays.find((a) => a.id === input.statArrayId);
  c.content = { ...content.versions };
  c.build.stats = { method: (array?.id ?? "manual") as "standard" | "balanced" | "minmax" | "manual", assign: { ...input.assign } };
  c.build.ancestry = { id: input.ancestryId, choices: input.ancestryChoices };
  c.build.background = { id: input.backgroundId, choices: input.backgroundChoices };
  c.build.languages = [...input.languages];
  c.build.levels = [{ level: 1, classId: input.classId, hp: { method: "starting", value: cls?.startingHp ?? 0 }, skillPoints: { ...input.skillPoints }, choices: {} }];
  if (input.kit === "class" && cls) {
    c.play.inventory = cls.startingGear.map((g) => {
      const name = content.weapons.get(g.id)?.name ?? content.armor.get(g.id)?.name ?? content.shields.get(g.id)?.name ?? content.gear.get(g.id)?.name ?? g.id;
      const wearable = content.armor.has(g.id) || content.shields.has(g.id) || content.weapons.has(g.id);
      return { itemId: g.id, name, qty: g.qty, equipped: wearable, notes: "" };
    });
  } else {
    c.play.gold = content.core.defaults.startingGold;
  }
  const sheet = derive(content, c);
  c.play.hp = sheet.hp.max;
  for (const r of sheet.resources) c.play.resources[r.def.id] = { current: r.max };
  return c;
}

/** Every problem in a creation input, by step (empty = ready to create). */
export function validateCreation(content: Content, input: CreationInput): Problem[] {
  const problems: Problem[] = [];
  const cls = content.classes.get(input.classId);
  if (!cls) problems.push({ step: "class", message: "Choose a class." });
  const ancestry = content.ancestries.get(input.ancestryId);
  if (!ancestry) problems.push({ step: "ancestry", message: "Choose an ancestry." });
  const background = content.backgrounds.get(input.backgroundId);
  if (!background) problems.push({ step: "background", message: "Choose a background." });
  const array = content.core.statArrays.find((a) => a.id === input.statArrayId);
  for (const m of checkStats(cls, array?.values, input.assign)) problems.push({ step: "stats", message: m });
  if (background?.requires) {
    const v = input.assign[background.requires.stat];
    if (v !== undefined && v > background.requires.max) {
      problems.push({ step: "background", message: `${background.name} needs ${background.requires.stat} ${background.requires.max} or lower at character creation.` });
    }
  }
  for (const m of checkStartingSkills(content, input.skillPoints)) problems.push({ step: "skills", message: m });
  // Unanswered ancestry/background choices (free text and options alike).
  for (const { choice } of choicesIn(ancestry?.features ?? [])) {
    if ((input.ancestryChoices[choice.id] ?? []).length < choice.count && choice.from.kind !== "save") problems.push({ step: "ancestry", message: `Answer: ${choice.prompt}` });
  }
  for (const { choice } of choicesIn(background?.features ?? [])) {
    if ((input.backgroundChoices[choice.id] ?? []).length < choice.count) problems.push({ step: "background", message: `Answer: ${choice.prompt}` });
  }
  const int = input.assign.INT ?? 0;
  if (input.languages.length > Math.max(0, int)) problems.push({ step: "languages", message: `You can learn ${Math.max(0, int)} extra language${int === 1 ? "" : "s"}.` });
  if (!input.name.trim()) problems.push({ step: "name", message: "Give your hero a name." });
  return problems;
}

// ---- Leveling up (p.21) ----

export interface LevelUpPlan {
  level: number;
  features: FeatureDefT[];
  choices: { choice: ChoiceDefT; featureId: string }[];
  hitDie: string;
  average: number;
}

export function levelUpPlan(content: Content, c: Character, sheet: Sheet = derive(content, c)): LevelUpPlan | null {
  const cls = sheet.cls;
  const next = sheet.level + 1;
  if (!cls || next > 20) return null;
  const classFeatures = (cls.levels[String(next)] ?? []).map((id) => cls.features.find((f) => f.id === id)).filter((f): f is FeatureDefT => !!f);
  const sub = sheet.subclass;
  const subFeatures = sub ? (sub.levels[String(next)] ?? []).map((id) => sub.features.find((f) => f.id === id)).filter((f): f is FeatureDefT => !!f) : [];
  const features = [...classFeatures, ...subFeatures];
  const die = sheet.hitDice.die;
  return { level: next, features, choices: choicesIn(features), hitDie: die, average: content.core.levelUpHpAverage[die as "d4"] ?? Math.floor(Number(die.slice(1)) / 2) + 1 };
}

export interface LevelUpInput {
  hp: { method: "roll" | "average"; value: number };
  /** The new skill point. */
  addSkill: string;
  /** Optional: move 1 point from one skill to another. */
  move?: { from: string; to: string } | undefined;
  choices: Record<string, string[]>;
}

export function validateLevelUp(content: Content, c: Character, plan: LevelUpPlan, input: LevelUpInput, sheet: Sheet = derive(content, c)): string[] {
  const problems: string[] = [];
  const sides = Number(plan.hitDie.slice(1));
  if (input.hp.method === "average" && input.hp.value !== plan.average) problems.push(`The average for a ${plan.hitDie} is ${plan.average}.`);
  if (input.hp.method === "roll" && (input.hp.value < 1 || input.hp.value > sides)) problems.push(`A ${plan.hitDie} roll is 1–${sides}.`);
  const skills = new Set(content.core.skills.map((s) => s.id));
  if (!skills.has(input.addSkill)) problems.push("Choose a skill for your new skill point.");
  if (input.move) {
    if (!skills.has(input.move.from) || !skills.has(input.move.to) || input.move.from === input.move.to) problems.push("Choose two different skills to move a point between.");
    const from = sheet.skills.find((s) => s.id === input.move?.from);
    if (from && from.total < 0) problems.push(`You can't move a point out of ${from.name}: it's already negative.`);
  }
  for (const { choice } of plan.choices) {
    const picked = input.choices[choice.id] ?? [];
    if (picked.length !== choice.count) problems.push(`Answer: ${choice.prompt}`);
    if (choice.from.kind === "stat" && picked.some((p) => !(choice.from as { stats: string[] }).stats.includes(p))) problems.push(`Invalid choice for ${choice.prompt}`);
  }
  return problems;
}

/** Applies a validated level-up. Leveling happens during a Safe Rest (p.21), so HP ends full. */
export function applyLevelUp(content: Content, draft: Character, plan: LevelUpPlan, input: LevelUpInput) {
  const classId = draft.build.levels[0]?.classId ?? "";
  const points: Record<string, number> = { [input.addSkill]: 1 };
  if (input.move) {
    points[input.move.from] = (points[input.move.from] ?? 0) - 1;
    points[input.move.to] = (points[input.move.to] ?? 0) + 1;
  }
  const record: LevelRecord = { level: plan.level, classId, hp: { method: input.hp.method, value: input.hp.value }, skillPoints: points, choices: input.choices };
  draft.build.levels.push(record);
  const after = derive(content, draft);
  draft.play.hp = after.hp.max;
  for (const r of after.resources) if (draft.play.resources[r.def.id] === undefined) draft.play.resources[r.def.id] = { current: r.max };
}

/** Removes the latest level (Undo last level-up). Never removes level 1. */
export function undoLastLevel(content: Content, draft: Character): boolean {
  if (draft.build.levels.length <= 1) return false;
  draft.build.levels.pop();
  const after = derive(content, draft);
  draft.play.hp = Math.min(draft.play.hp, after.hp.max);
  return true;
}
