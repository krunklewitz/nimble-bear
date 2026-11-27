// Turns a sheet + a chosen action/check into a roll, and a roll into a shareable message.
// No React. Uses the dice engine (rules/dice.ts) and the character's roll options.
import type { RollOptionDefT } from "../data/schema";
import { resolveAttack, rollAttackDice, rollD20, rollPlain, type AttackInput, type AttackResult, type D20Result, type RolledDie, type Rng } from "../rules/dice";
import type { Sheet, SheetAction } from "../rules/derive";
import { expandVars } from "../rules/derive";
import { diceText, toDice, type DiceSpec } from "../rules/formula";
import type { RollMessage } from "../platform/types";

export type RollKind = "attack" | "heal" | "check" | "save" | "initiative" | "plain";

export interface OptionView {
  option: RollOptionDefT & { sourceId: string };
  /** auto: always applied; toggle: the player decides; reminder: shown, applied by hand. */
  how: "auto" | "toggle" | "reminder";
  /** Applied only on a crit (Sneak Attack). */
  onCrit: boolean;
  used: number;
  max: number | null;
}

const CRIT_SITUATION = /\bcrit/i;

/** Roll options relevant to a roll, and how each one is handled. */
export function optionsFor(sheet: Sheet, kind: RollKind, scope: { skill?: string | undefined; stat?: string | undefined; group?: string | undefined }, uses: Record<string, number>): OptionView[] {
  const on = kind === "attack" ? ["attack", "damage", "any"] : kind === "heal" ? ["heal", "any"] : kind === "plain" ? ["any"] : [kind, "any"];
  return sheet.rollOptions
    .filter((o) => on.includes(o.on))
    .filter((o) => !o.scope || o.scope === scope.skill || o.scope === scope.stat || o.scope === scope.group)
    .map((o) => {
      const onCrit = o.change === "addDice" && typeof o.when === "object" && CRIT_SITUATION.test(o.when.situation);
      const automatic = ["advantage", "disadvantage", "addDice", "add", "floor", "setPrimary"].includes(o.change);
      const how: OptionView["how"] = !automatic ? "reminder" : o.mode === "auto" && (!o.when || onCrit) ? "auto" : "toggle";
      const max = o.limit ? Number(o.limit.uses.match(/^\d+$/) ? o.limit.uses : sheet.scope[o.limit.uses] ?? 1) : null;
      return { option: o, how, onCrit, used: uses[o.id] ?? 0, max };
    });
}

export interface RollRequest {
  kind: RollKind;
  label: string;
  /** For attacks/heals: the action rolled. */
  action?: SheetAction | undefined;
  /** For checks/saves/initiative: the modifier and its label. */
  modifier?: number | undefined;
  skill?: string | undefined;
  stat?: string | undefined;
  /** Net advantage chosen by the player (before options and Rushed Attacks). */
  advantage: number;
  /** Disadvantage from Rushed Attacks. */
  rushed: number;
  /** Toggle options switched on. */
  toggles: string[];
  options: OptionView[];
}

export type RollOutcome =
  | { kind: "attack"; input: AttackInput; rolled: RolledDie[]; result: AttackResult; appliedOptions: string[]; canSetPrimary: OptionView | undefined }
  | { kind: "d20"; result: D20Result; appliedOptions: string[]; floorTo: number | undefined }
  | { kind: "plain"; dice: RolledDie[]; total: number; appliedOptions: string[] };

function applies(view: OptionView, toggles: string[]): boolean {
  if (view.how === "reminder") return false;
  if (view.max !== null && view.used >= view.max) return false;
  return view.how === "auto" || toggles.includes(view.option.id);
}

export function performRoll(sheet: Sheet, req: RollRequest, rng: Rng): RollOutcome {
  const active = req.options.filter((v) => applies(v, req.toggles));
  const applied = active.map((v) => v.option.label);
  let adv = req.advantage - req.rushed;
  for (const v of active) {
    if (v.option.change === "advantage") adv += 1;
    if (v.option.change === "disadvantage") adv -= 1;
  }
  const flat = active.filter((v) => v.option.change === "add" && v.option.value).map((v) => ({ label: v.option.label, value: Number(sheet.scope[v.option.value as string] ?? v.option.value) }));

  if ((req.kind === "attack" || req.kind === "heal") && req.action?.roll) {
    const r = req.action.roll;
    if (req.kind === "heal" || r.kind === "heal") {
      const { dice, total } = rollPlain(r.dice, rng);
      return { kind: "plain", dice, total: total + flat.reduce((s, f) => s + f.value, 0), appliedOptions: applied };
    }
    const bonus = active
      .filter((v) => v.option.change === "addDice" && v.option.value)
      .map((v) => ({ label: v.option.label, spec: toDice(expandVars(v.option.value as string, sheet.vars), sheet.scope), onCrit: v.onCrit }));
    const input: AttackInput = { dice: r.dice, advantage: adv, canMiss: r.canMiss, canCrit: r.canCrit, vicious: r.vicious, bonus, flat };
    const rolled = rollAttackDice(input, rng);
    const result = resolveAttack(rolled, input, rng);
    const canSetPrimary = req.options.find((v) => v.option.change === "setPrimary" && (v.max === null || v.used < v.max) && (v.how === "auto" || req.toggles.includes(v.option.id)));
    return { kind: "attack", input, rolled, result, appliedOptions: applied, canSetPrimary };
  }

  if (req.kind === "plain" && req.action?.roll) {
    const { dice, total } = rollPlain(req.action.roll.dice, rng);
    return { kind: "plain", dice, total, appliedOptions: applied };
  }

  const result = rollD20({ modifier: req.modifier ?? 0, advantage: adv, parts: [{ label: req.label, value: req.modifier ?? 0 }, ...flat] }, rng);
  result.total += flat.reduce((s, f) => s + f.value, 0);
  const floors = active.filter((v) => v.option.change === "floor" && v.option.value).map((v) => Number(sheet.scope[v.option.value as string] ?? NaN) || evalFloor(v.option.value as string, sheet));
  const floorTo = floors.length ? Math.max(...floors) : undefined;
  return { kind: "d20", result, appliedOptions: applied, floorTo: floorTo !== undefined && result.total < floorTo ? floorTo : undefined };
}

function evalFloor(formula: string, sheet: Sheet): number {
  try {
    const spec = toDice(formula, sheet.scope);
    return spec.groups.length ? NaN : spec.flat;
  } catch {
    return NaN;
  }
}

/** Re-resolves an attack after the player changes the Primary Die (keeps the other dice). */
export function changePrimary(outcome: Extract<RollOutcome, { kind: "attack" }>, value: number, rng: Rng): Extract<RollOutcome, { kind: "attack" }> {
  return { ...outcome, result: resolveAttack(outcome.rolled, outcome.input, rng, value) };
}

const dieText = (d: RolledDie) => `${d.value}${d.kept ? "" : "✗"}${d.primary ? "★" : ""}`;

/** Plain-language breakdown lines for the log and broadcast. */
export function describe(outcome: RollOutcome, req: RollRequest): { summary: string; detail: string[]; total: number; crit: boolean; miss: boolean } {
  const detail: string[] = [];
  if (req.advantage || req.rushed) detail.push(`Advantage ${req.advantage >= 0 ? "+" : ""}${req.advantage}${req.rushed ? `, Rushed −${req.rushed}` : ""}`);
  if (outcome.appliedOptions.length) detail.push(`Applied: ${outcome.appliedOptions.join(", ")}`);
  if (outcome.kind === "attack") {
    const r = outcome.result;
    const groups = new Map<string, RolledDie[]>();
    for (const d of r.dice) {
      const key = d.role === "bonus" ? (d.label ?? "Bonus") : d.role === "explosion" ? "Crit" : d.role === "vicious" ? "Vicious" : `d${d.sides}`;
      groups.set(key, [...(groups.get(key) ?? []), d]);
    }
    for (const [k, ds] of groups) detail.push(`${k}: ${ds.map(dieText).join(" ")}`);
    for (const f of r.flat) detail.push(`${f.label}: ${f.value >= 0 ? "+" : ""}${f.value}`);
    const spec: DiceSpec = outcome.input.dice;
    const note = r.miss ? " (miss)" : r.crit ? ` (crit${r.explosions > 1 ? ` ×${r.explosions}` : ""})` : "";
    return { summary: `${diceText(spec)} → ${r.total}${note}`, detail, total: r.total, crit: r.crit, miss: r.miss };
  }
  if (outcome.kind === "d20") {
    const r = outcome.result;
    detail.push(`d20: ${r.dice.map(dieText).join(" ")}`);
    for (const p of r.parts) detail.push(`${p.label}: ${p.value >= 0 ? "+" : ""}${p.value}`);
    const total = outcome.floorTo ?? r.total;
    if (outcome.floorTo !== undefined) detail.push(`Raised to ${outcome.floorTo}`);
    const note = r.autoSuccess ? " (natural 20)" : r.autoFail ? " (natural 1)" : "";
    return { summary: `d20${(req.modifier ?? 0) >= 0 ? "+" : ""}${req.modifier ?? 0} → ${total}${note}`, detail, total, crit: r.autoSuccess, miss: r.autoFail };
  }
  detail.push(`Dice: ${outcome.dice.map(dieText).join(" ")}`);
  return { summary: `→ ${outcome.total}`, detail, total: outcome.total, crit: false, miss: false };
}

export function toMessage(
  id: string,
  character: string,
  player: string,
  req: RollRequest,
  outcome: RollOutcome,
  privacy: RollMessage["privacy"],
  at: string,
): RollMessage {
  const d = describe(outcome, req);
  return { v: 1, id, character, player, label: req.label, summary: d.summary, total: d.total, detail: d.detail, crit: d.crit, miss: d.miss, privacy, at };
}

/** A small in-memory roll log with subscribers (newest first). */
export class RollLog {
  private entries: RollMessage[] = [];
  private readonly listeners = new Set<() => void>();
  private version = 0;
  constructor(private readonly max = 100) {}
  add(m: RollMessage) {
    if (this.entries.some((e) => e.id === m.id)) return;
    this.entries = [m, ...this.entries].slice(0, this.max);
    this.version++;
    for (const l of this.listeners) l();
  }
  list(): RollMessage[] {
    return this.entries;
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
}
