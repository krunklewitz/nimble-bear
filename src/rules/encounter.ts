// Encounter budgeting, from the GMG "Combat Encounter Guidelines"
// (NimbleGMG3.0.pdf, PDF page 12, printed pages 22–23; minion table checked against the page image).
//
// - Monster Budget = the total levels of the heroes. Using all of it is Hard.
// - Easy 50%, Medium 75%, Hard 100%, Deadly 125%, Very Deadly 150%.
// - Typical encounters have 1–3 monsters per hero, not counting minions.
// - Minions: "2 minions/hero: Counts as 1 monster of equal level to a hero" (RQ-030: read as
//   each minion costing half the party's average level).
// - Monster levels can be fractions ("lvl 1/2 means 2 goblins are about as strong as a level 1
//   hero", GMG PDF 3, printed 5), so a monster costs its level.

export const DIFFICULTIES = [
  { id: "easy", label: "Easy", percent: 50 },
  { id: "medium", label: "Medium", percent: 75 },
  { id: "hard", label: "Hard", percent: 100 },
  { id: "deadly", label: "Deadly", percent: 125 },
  { id: "veryDeadly", label: "Very Deadly", percent: 150 },
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/** A monster level as printed: "4", "1/2", "1/3". Returns NaN when it isn't one. */
export function parseLevel(level: string): number {
  const m = /^\s*(\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(level);
  if (!m) return Number.NaN;
  const whole = Number(m[1]);
  const denominator = m[2] === undefined ? 1 : Number(m[2]);
  return denominator === 0 ? Number.NaN : whole / denominator;
}

export function monsterBudget(heroLevels: number[]): number {
  return heroLevels.reduce((sum, l) => sum + l, 0);
}

export function averageLevel(heroLevels: number[]): number {
  return heroLevels.length ? monsterBudget(heroLevels) / heroLevels.length : 0;
}

export interface EncounterEntry {
  /** Printed level, e.g. "1/2". Ignored for minions. */
  level: string;
  minion: boolean;
  count: number;
}

/** Monster levels the encounter spends. Minions cost half the party's average level each (RQ-030). */
export function encounterCost(entries: EncounterEntry[], heroLevels: number[]): number {
  const minionCost = averageLevel(heroLevels) / 2;
  let cost = 0;
  for (const e of entries) {
    const each = e.minion ? minionCost : parseLevel(e.level);
    if (Number.isFinite(each)) cost += each * Math.max(0, e.count);
  }
  return cost;
}

/**
 * The band an encounter falls in: the highest one whose share of the budget it reaches.
 * Below 50% is still called Easy (the book: "less than that: Medium or Easy").
 */
export function difficultyOf(cost: number, budget: number): { difficulty: Difficulty; percent: number } {
  const percent = budget > 0 ? Math.round((cost / budget) * 100) : 0;
  let difficulty: Difficulty = DIFFICULTIES[0];
  for (const d of DIFFICULTIES) if (percent >= d.percent) difficulty = d;
  return { difficulty, percent };
}

/** Plain-language warnings from the guidelines. */
export function encounterWarnings(entries: EncounterEntry[], heroCount: number): string[] {
  const warnings: string[] = [];
  if (heroCount <= 0) return ["Add the heroes' levels to see the budget."];
  const monsters = entries.filter((e) => !e.minion).reduce((n, e) => n + Math.max(0, e.count), 0);
  const minions = entries.filter((e) => e.minion).reduce((n, e) => n + Math.max(0, e.count), 0);
  if (monsters > 3 * heroCount) warnings.push(`${monsters} monsters for ${heroCount} heroes: more than 3 per hero can be far deadlier than the budget suggests (GMG p.22).`);
  if (monsters > 0 && monsters < heroCount && minions === 0) warnings.push("Fewer monsters than heroes: the heroes may outnumber them and find it easier than the budget suggests (GMG p.22).");
  if (minions > 4 * heroCount) warnings.push(`${minions} minions for ${heroCount} heroes: more than 3–4 per hero is "MUCH more challenging" (GMG p.23).`);
  return warnings;
}

/** "Suggested minion die size by party level" (GMG p.23). The printed ranges overlap, so a level can suggest two sizes. */
const MINION_DICE: { from: number; to: number; die: string }[] = [
  { from: 1, to: 3, die: "d4" },
  { from: 2, to: 5, die: "d6" },
  { from: 4, to: 10, die: "d8" },
  { from: 10, to: 13, die: "d10" },
  { from: 12, to: 17, die: "d12" },
  { from: 15, to: 20, die: "d20" },
];

export function suggestedMinionDice(partyLevel: number): string[] {
  const level = Math.max(1, Math.min(20, Math.round(partyLevel)));
  return MINION_DICE.filter((r) => level >= r.from && level <= r.to).map((r) => r.die);
}
