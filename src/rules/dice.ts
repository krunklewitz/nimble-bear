// Dice engine. Rules: Core Rules 3.2 p.9 (Advantage & Disadvantage, PDF 5) and p.14
// (Attack, PDF 8), checked against the page image (RULES_QUESTIONS RQ-R1):
// - Advantage: roll 1 extra die of the same type per instance, remove the lowest; disadvantage
//   removes the highest. Ties are removed left to right. 1 advantage cancels 1 disadvantage.
// - The Primary Die is the leftmost remaining die. Primary 1 = miss. Primary at max = crit:
//   roll the Primary Die again and add it, repeating every time it rolls max.
// - Vicious: roll 1 additional die whenever you roll crit damage (RQ-007: one per crit roll).
// - Checks and saves: d20 + modifier; natural 1 always fails, natural 20 always succeeds.
// - AoE, minions and some others can't miss or crit; d44/d66/d88 have no Primary Die.
import type { DiceGroup, DiceSpec } from "./formula";

/** Returns an integer 1..sides. */
export type Rng = (sides: number) => number;

export type DieRole = "base" | "extra" | "explosion" | "vicious" | "bonus";

export interface RolledDie {
  sides: number;
  value: number;
  role: DieRole;
  /** False when removed by advantage/disadvantage. */
  kept: boolean;
  /** Label for bonus dice ("Sneak Attack"). */
  label?: string;
  primary?: boolean;
}

export interface FlatPart {
  label: string;
  value: number;
}

export interface BonusDice {
  label: string;
  spec: DiceSpec;
  /** Only added when the attack crits (e.g. Sneak Attack). */
  onCrit?: boolean;
}

export interface AttackInput {
  dice: DiceSpec;
  /** Net advantage: positive = advantage count, negative = disadvantage count. */
  advantage: number;
  canMiss: boolean;
  canCrit: boolean;
  vicious: boolean;
  bonus?: BonusDice[];
  flat?: FlatPart[];
}

export interface AttackResult {
  dice: RolledDie[];
  flat: FlatPart[];
  total: number;
  miss: boolean;
  crit: boolean;
  /** Times the Primary Die exploded. */
  explosions: number;
  /** Value of the Primary Die after any change (undefined when there is none). */
  primary: number | undefined;
}

/** Index of each die to drop for `n` advantage (drop lowest) or disadvantage (drop highest); ties left to right. */
export function dropIndexes(values: number[], n: number, mode: "lowest" | "highest"): Set<number> {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => (mode === "lowest" ? a.v - b.v : b.v - a.v) || a.i - b.i);
  return new Set(order.slice(0, n).map((x) => x.i));
}

function expand(groups: DiceGroup[]): { sides: number; tens: boolean }[] {
  const out: { sides: number; tens: boolean }[] = [];
  for (const g of groups) {
    if (g.tens) out.push({ sides: g.sides, tens: true }, { sides: g.sides, tens: true });
    else for (let i = 0; i < g.count; i++) out.push({ sides: g.sides, tens: false });
  }
  return out;
}

/** Rolls the base dice (with advantage extras) without resolving. Changing a die and re-resolving keeps these. */
export function rollAttackDice(input: AttackInput, rng: Rng): RolledDie[] {
  const base = expand(input.dice.groups);
  const first = base[0];
  if (!first) return [];
  const dice: RolledDie[] = base.map((d) => ({ sides: d.sides, value: rng(d.sides), role: "base", kept: true }));
  const extras = Math.abs(input.advantage);
  for (let i = 0; i < extras; i++) dice.push({ sides: first.sides, value: rng(first.sides), role: "extra", kept: true });
  if (extras > 0) {
    const drop = dropIndexes(dice.map((d) => d.value), extras, input.advantage > 0 ? "lowest" : "highest");
    dice.forEach((d, i) => {
      if (drop.has(i)) d.kept = false;
    });
  }
  return dice;
}

/**
 * Resolves rolled dice into a result. `primaryOverride` changes the Primary Die's value
 * ("change the Primary Die roll to whatever you like"). Explosions, Vicious and bonus dice
 * are rolled here.
 */
export function resolveAttack(rolled: RolledDie[], input: AttackInput, rng: Rng, primaryOverride?: number): AttackResult {
  const dice: RolledDie[] = rolled.map((d) => ({ ...d, primary: false }));
  // The formula's own modifier ("1d6+2") comes first, then any extra named bonuses.
  const flat = [...(input.dice.flat !== 0 ? [{ label: "Modifier", value: input.dice.flat }] : []), ...(input.flat ?? [])];
  const tens = input.dice.groups[0]?.tens === true;
  const kept = dice.filter((d) => d.kept);
  const primaryDie = tens ? undefined : kept[0];
  if (primaryDie) {
    primaryDie.primary = true;
    if (primaryOverride !== undefined) primaryDie.value = Math.min(primaryDie.sides, Math.max(1, primaryOverride));
  }

  const miss =input.canMiss && primaryDie !== undefined && primaryDie.value === 1;
  if (miss) return { dice, flat, total: 0, miss: true, crit: false, explosions: 0, primary: primaryDie.value };

  const crit = input.canCrit && primaryDie !== undefined && primaryDie.value === primaryDie.sides;
  let explosions = 0;
  if (crit && primaryDie) {
    let again: number;
    do {
      again = rng(primaryDie.sides);
      dice.push({ sides: primaryDie.sides, value: again, role: "explosion", kept: true });
      if (input.vicious) dice.push({ sides: primaryDie.sides, value: rng(primaryDie.sides), role: "vicious", kept: true });
      explosions++;
    } while (again === primaryDie.sides);
  }

  for (const b of input.bonus ?? []) {
    if (b.onCrit && !crit) continue;
    for (const d of expand(b.spec.groups)) dice.push({ sides: d.sides, value: rng(d.sides), role: "bonus", kept: true, label: b.label });
    if (b.spec.flat) flat.push({ label: b.label, value: b.spec.flat });
  }

  let diceTotal: number;
  if (tens) {
    // Leftmost kept die is the tens place, the next is the ones (Core p.51, Unspeakable Word).
    const [t, o] = kept;
    diceTotal = (t?.value ?? 0) * 10 + (o?.value ?? 0) + dice.filter((d) => d.role !== "base" && d.role !== "extra").reduce((s, d) => s + d.value, 0);
  } else {
    diceTotal = dice.filter((d) => d.kept).reduce((s, d) => s + d.value, 0);
  }
  const total = diceTotal + flat.reduce((s, f) => s + f.value, 0);
  return { dice, flat, total: Math.max(0, total), miss: false, crit, explosions, primary: primaryDie?.value };
}

export interface D20Input {
  modifier: number;
  advantage: number;
  parts?: FlatPart[];
}

export interface D20Result {
  dice: RolledDie[];
  natural: number;
  total: number;
  /** Natural 20: always succeeds. */
  autoSuccess: boolean;
  /** Natural 1: always fails. */
  autoFail: boolean;
  parts: FlatPart[];
}

/** Skill checks, saves and Initiative: d20 + modifier, with advantage/disadvantage. */
export function rollD20(input: D20Input, rng: Rng): D20Result {
  const n = 1 + Math.abs(input.advantage);
  const dice: RolledDie[] = Array.from({ length: n }, (_, i) => ({ sides: 20, value: rng(20), role: i === 0 ? "base" : "extra", kept: true }));
  if (n > 1) {
    const drop = dropIndexes(dice.map((d) => d.value), n - 1, input.advantage > 0 ? "lowest" : "highest");
    dice.forEach((d, i) => {
      if (drop.has(i)) d.kept = false;
    });
  }
  const natural = dice.find((d) => d.kept)?.value ?? 0;
  return {
    dice,
    natural,
    total: natural + input.modifier,
    autoSuccess: natural === 20,
    autoFail: natural === 1,
    parts: input.parts ?? [{ label: "Modifier", value: input.modifier }],
  };
}

/** Plain dice total (healing, Hit Dice, flat effects): no miss or crit. */
export function rollPlain(spec: DiceSpec, rng: Rng): { dice: RolledDie[]; total: number } {
  const dice = expand(spec.groups).map((d) => ({ sides: d.sides, value: rng(d.sides), role: "base" as const, kept: true }));
  return { dice, total: dice.reduce((s, d) => s + d.value, 0) + spec.flat };
}

/** Starting actions from an Initiative total (Core p.12, PDF 7). A natural 20 always gives 3. */
export function initiativeActions(total: number, natural: number, table: { minTotal: number | null; maxTotal: number | null; actions: number }[]): number {
  if (natural === 20) return 3;
  for (const row of table) {
    if ((row.minTotal === null || total >= row.minTotal) && (row.maxTotal === null || total <= row.maxTotal)) return row.actions;
  }
  return 1;
}

/** Scripted dice for tests: returns the given values in order. */
export function scriptedRng(values: number[]): Rng {
  let i = 0;
  return (sides) => {
    const v = values[i++];
    if (v === undefined) throw new Error("scriptedRng ran out of values");
    if (v < 1 || v > sides) throw new Error(`scripted value ${v} doesn't fit d${sides}`);
    return v;
  };
}
