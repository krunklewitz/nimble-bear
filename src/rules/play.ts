// Play-state rules. Each function edits a draft character (inside library.update) and
// returns what happened, for the UI and the roll log. Sources (Core Rules 3.2):
// HP/Dying/Wounds/temp HP/Hit Dice p.9; Initiative and actions p.12; 1/turn and 1/round p.13;
// actions, Rushed Attacks, reactions p.14–15; Field and Safe Rests p.16–17.
import type { CoreRulesDefT, ResourceDefT } from "../data/schema";
import { initiativeActions, rollPlain, type Rng } from "./dice";
import type { Sheet, SheetAction } from "./derive";
import type { Character } from "./persistence/character";

type Trigger = ResourceDefT["recover"][number]["on"];

/** Flag set between the end of your turn and the start of your next one (Core p.13). */
export const OFF_TURN = "combat:offTurn";
export const isOffTurn = (c: Character): boolean => c.play.combat.active && c.play.flags[OFF_TURN] === true;

type Usable = Pick<SheetAction, "id" | "actions" | "manaCost" | "resourceCost" | "limit" | "kind" | "roll">;

/** Any ability or spell that can harm an enemy is an attack (Core p.14; Glossary p.56). */
export const isAttack = (a: Pick<SheetAction, "kind" | "roll">): boolean =>
  a.kind === "weapon" || a.kind === "attack" || a.roll?.kind === "damage" || a.roll?.kind === "aoe";

function recover(draft: Character, sheet: Sheet, on: Trigger) {
  for (const r of sheet.resources) {
    for (const rule of r.def.recover) {
      if (rule.on !== on) continue;
      const cur = draft.play.resources[r.def.id]?.current ?? r.max;
      const add = rule.amount === "all" ? r.max : Number(rule.amount);
      draft.play.resources[r.def.id] = { current: Math.min(r.max, cur + (Number.isFinite(add) ? add : 0)) };
    }
  }
}

function lose(draft: Character, sheet: Sheet, on: Trigger) {
  for (const r of sheet.resources) if (r.def.lose?.includes(on)) draft.play.resources[r.def.id] = { current: 0 };
}

/** Clears use counters of abilities whose limit resets at these periods. */
function resetUses(draft: Character, sheet: Sheet, periods: string[]) {
  for (const a of sheet.actions) if (a.limit && periods.includes(a.limit.per)) draft.play.uses[a.id] = 0;
  for (const o of sheet.rollOptions) if (o.limit && periods.includes(o.limit.per)) draft.play.uses[o.id] = 0;
}

export interface DamageResult {
  tempAbsorbed: number;
  hpLost: number;
  woundsGained: number;
  droppedToZero: boolean;
  died: boolean;
}

/**
 * Applies damage (after the player's own Defense/armor reductions). Temp HP first.
 * Dropping to 0 HP: 1 Wound and Dying. Damage while Dying: 2 Wounds, a crit 3 (p.9).
 */
export function applyDamage(draft: Character, sheet: Sheet, amount: number, opts: { crit?: boolean } = {}): DamageResult {
  const dmg = Math.max(0, Math.floor(amount));
  const result: DamageResult = { tempAbsorbed: 0, hpLost: 0, woundsGained: 0, droppedToZero: false, died: false };
  if (dmg === 0) return result;
  const wasDying = draft.play.hp <= 0;
  const fromTemp = Math.min(draft.play.tempHp, dmg);
  draft.play.tempHp -= fromTemp;
  result.tempAbsorbed = fromTemp;
  const rest = dmg - fromTemp;
  if (wasDying) {
    if (rest > 0) result.woundsGained = opts.crit ? 3 : 2;
  } else if (rest > 0) {
    const before = draft.play.hp;
    draft.play.hp = Math.max(0, before - rest);
    result.hpLost = before - draft.play.hp;
    if (draft.play.hp === 0) {
      result.droppedToZero = true;
      result.woundsGained = 1;
    }
  }
  draft.play.wounds += result.woundsGained;
  // Dying: "your actions are limited to 1" (p.9).
  if (draft.play.hp <= 0 && draft.play.combat.active) draft.play.combat.actions = Math.min(draft.play.combat.actions, 1);
  result.died = draft.play.wounds >= sheet.wounds.max;
  if (rest > 0) lose(draft, sheet, "damageTaken");
  if (result.woundsGained > 0) recover(draft, sheet, "woundGained");
  return result;
}

export function heal(draft: Character, sheet: Sheet, amount: number): { healed: number; revived: boolean } {
  const before = draft.play.hp;
  draft.play.hp = Math.min(sheet.hp.max, Math.max(0, before) + Math.max(0, Math.floor(amount)));
  if (draft.play.hp >= sheet.hp.max) recover(draft, sheet, "healedToMax");
  return { healed: draft.play.hp - before, revived: before <= 0 && draft.play.hp > 0 };
}

/** Temp HP don't combine: the player picks which amount to keep (p.9). */
export function setTempHp(draft: Character, value: number) {
  draft.play.tempHp = Math.max(0, Math.floor(value));
}

/**
 * Catch Breath / Make Camp (p.16): spend Hit Dice one at a time; each heals its roll
 * (or max value when making camp) + STR. Negative STR lowers each die (min 0).
 */
export function spendHitDice(draft: Character, sheet: Sheet, count: number, mode: "roll" | "max", rng: Rng): { spent: number; rolls: number[]; healed: number } {
  const spend = Math.max(0, Math.min(count, sheet.hitDice.remaining));
  const sides = Number(sheet.hitDice.die.slice(1));
  const rolls: number[] = [];
  let total = 0;
  for (let i = 0; i < spend; i++) {
    const face = mode === "max" ? sides : rollPlain({ groups: [{ count: 1, sides, tens: false }], flat: 0 }, rng).total;
    rolls.push(face);
    total += Math.max(0, face + sheet.stats.STR);
  }
  draft.play.hitDiceSpent += spend;
  const { healed } = heal(draft, sheet, total);
  return { spent: spend, rolls, healed };
}

export function fieldRest(draft: Character, sheet: Sheet) {
  recover(draft, sheet, "fieldRest");
  resetUses(draft, sheet, ["fieldRest", "encounter", "turn", "round", "minute"]);
}

/** Safe Rest (p.17): full HP, Hit Dice, mana and class resources; heal 1 Wound; temp HP expire. */
export function safeRest(draft: Character, sheet: Sheet): { woundHealed: boolean } {
  draft.play.hp = sheet.hp.max;
  draft.play.hitDiceSpent = 0;
  draft.play.tempHp = 0;
  const woundHealed = draft.play.wounds > 0;
  draft.play.wounds = Math.max(0, draft.play.wounds - 1);
  recover(draft, sheet, "safeRest");
  recover(draft, sheet, "fieldRest");
  resetUses(draft, sheet, ["safeRest", "fieldRest", "encounter", "turn", "round", "day", "minute"]);
  draft.play.combat = { active: false, round: 0, actions: 3, attacks: {}, reactionsUsed: [] };
  return { woundHealed };
}

/** Starts combat from an Initiative roll (p.12). */
export function startCombat(draft: Character, sheet: Sheet, core: CoreRulesDefT, total: number, natural: number): { actions: number } {
  const actions = initiativeActions(total, natural, core.initiativeActions);
  draft.play.combat = { active: true, round: 1, actions: sheet.dying ? Math.min(1, actions) : actions, attacks: {}, reactionsUsed: [] };
  draft.play.flags[OFF_TURN] = false;
  resetUses(draft, sheet, ["encounter", "turn", "round"]);
  recover(draft, sheet, "initiative");
  return { actions };
}

/** End of your turn: all 3 actions come back (max 1 while Dying); 1/turn and 1/round reset (p.13–14). */
export function endTurn(draft: Character, sheet: Sheet) {
  const debt = draft.play.uses["debt:actions"] ?? 0;
  draft.play.combat.actions = Math.max(0, (sheet.dying ? 1 : 3) - debt);
  delete draft.play.uses["debt:actions"];
  draft.play.combat.attacks = {};
  draft.play.combat.reactionsUsed = [];
  draft.play.flags[OFF_TURN] = true;
  resetUses(draft, sheet, ["turn", "round"]);
  recover(draft, sheet, "turnEnd");
}

/** Start of your next turn (heroes act whenever they're ready, p.12). */
export function startTurn(draft: Character, sheet: Sheet) {
  draft.play.flags[OFF_TURN] = false;
  draft.play.combat.round += 1;
  draft.play.combat.attacks = {};
  resetUses(draft, sheet, ["turn"]);
}

export const REACTIONS = ["Defend", "Interpose", "Opportunity Attack", "Help"] as const;
export type Reaction = (typeof REACTIONS)[number];

/** Reactions cost 1 action, each 1/round (p.15); Defending in armor you aren't proficient with costs 1 more (p.32). */
export function reactionCost(sheet: Sheet, name: Reaction): number {
  return name === "Defend" && !sheet.defense.armorProficient ? 2 : 1;
}

export function checkReaction(draft: Character, sheet: Sheet, name: Reaction): string[] {
  const c = draft.play.combat;
  const problems: string[] = [];
  if (c.reactionsUsed.includes(name)) problems.push(name + " is 1/round: already used since your last turn ended.");
  const cost = reactionCost(sheet, name);
  if (c.active && cost > c.actions) problems.push("Needs " + cost + " action" + (cost === 1 ? "" : "s") + ", you have " + c.actions + ".");
  return problems;
}

export function useReaction(draft: Character, sheet: Sheet, name: Reaction) {
  const c = draft.play.combat;
  if (c.active) c.actions = Math.max(0, c.actions - reactionCost(sheet, name));
  if (!c.reactionsUsed.includes(name)) c.reactionsUsed.push(name);
}

export function endCombat(draft: Character, sheet: Sheet) {
  draft.play.combat = { active: false, round: 0, actions: 3, attacks: {}, reactionsUsed: [] };
  draft.play.flags[OFF_TURN] = false;
  lose(draft, sheet, "combatEnd");
  recover(draft, sheet, "combatEnd");
  resetUses(draft, sheet, ["encounter", "turn", "round"]);
}

export interface UseCheck {
  ok: boolean;
  /** Reasons it isn't affordable; the player may still go ahead. */
  problems: string[];
  /** Disadvantage from Rushed Attacks (p.14): one per earlier attack this turn by the same creature. */
  rushed: number;
}

/** Checks whether an action can be paid for: actions (in combat), mana, resource, limited uses. */
export function checkUse(draft: Character, sheet: Sheet, action: Usable, opts: { mana?: number | undefined; creature?: string | undefined } = {}): UseCheck {
  const problems: string[] = [];
  const c = draft.play.combat;
  if (c.active && (action.actions ?? 0) > c.actions) problems.push(`Needs ${action.actions} action${action.actions === 1 ? "" : "s"}, you have ${c.actions}.`);
  const mana = opts.mana ?? action.manaCost ?? 0;
  if (mana > 0) {
    const have = sheet.mana ? (draft.play.resources[sheet.mana.def.id]?.current ?? sheet.mana.max) : 0;
    if (mana > have) problems.push(`Needs ${mana} mana, you have ${have}.`);
  }
  if (action.resourceCost) {
    const res = sheet.resources.find((r) => r.def.id === action.resourceCost?.id);
    const have = res ? (draft.play.resources[res.def.id]?.current ?? res.max) : 0;
    if (action.resourceCost.amount > have) problems.push(`Needs ${action.resourceCost.amount} ${res?.def.name ?? action.resourceCost.id}, you have ${have}.`);
  }
  const offTurn = isOffTurn(draft);
  // 1/turn abilities can be used again on another creature's turn (p.13).
  const limited = action.limit && !(offTurn && action.limit.per === "turn");
  if (limited && action.limit && action.limit.used >= action.limit.max) problems.push("Already used " + action.limit.max + "× this " + action.limit.per + ".");
  // Rushed Attacks: additional attacks on your own turn (p.14).
  const rushed = isAttack(action) && c.active && !offTurn ? (c.attacks[opts.creature ?? "hero"] ?? 0) : 0;
  return { ok: problems.length === 0, problems, rushed };
}

/** Pays for an action. Spending more than you have floors at 0; the player was warned. */
export function payUse(draft: Character, sheet: Sheet, action: Usable, opts: { mana?: number | undefined; creature?: string | undefined } = {}) {
  const c = draft.play.combat;
  if (c.active) c.actions = Math.max(0, c.actions - (action.actions ?? 0));
  const mana = opts.mana ?? action.manaCost ?? 0;
  if (mana > 0 && sheet.mana) {
    const cur = draft.play.resources[sheet.mana.def.id]?.current ?? sheet.mana.max;
    draft.play.resources[sheet.mana.def.id] = { current: Math.max(0, cur - mana) };
  }
  if (action.resourceCost) {
    const res = sheet.resources.find((r) => r.def.id === action.resourceCost?.id);
    if (res) draft.play.resources[res.def.id] = { current: Math.max(0, (draft.play.resources[res.def.id]?.current ?? res.max) - action.resourceCost.amount) };
  }
  const offTurn = isOffTurn(draft);
  if (action.limit && !(offTurn && action.limit.per === "turn")) draft.play.uses[action.id] = (draft.play.uses[action.id] ?? 0) + 1;
  if (isAttack(action) && c.active && !offTurn) {
    const who = opts.creature ?? "hero";
    c.attacks[who] = (c.attacks[who] ?? 0) + 1;
  }
}

/** Sets a resource's current value (manual control), clamped to 0..max. */
export function setResource(draft: Character, sheet: Sheet, id: string, value: number) {
  const r = sheet.resources.find((x) => x.def.id === id);
  if (!r) return;
  draft.play.resources[id] = { current: Math.max(0, Math.min(r.max, Math.floor(value))) };
}
