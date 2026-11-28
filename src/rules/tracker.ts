// The GM's combat tracker (pure functions on a Campaign draft).
// Turn order (Core Rules 3.2, PDF 7, printed 13): heroes go first, in whatever order the table
// likes; monsters typically act last, and a monster (or group) acts at the same time each round.
// Monster armor (Core p.15, PDF 8): Medium −10 damage, Heavy −20; crits ignore armor.
// Minions (Core p.15; GMG p.4–5): no HP, any damage kills them.
// Legendary monsters (GMG PDF 20, printed 38–39): HP per hero; Bloodied at half HP; at 0 HP
// they are Dying and start their Last Stand, regaining the printed HP per hero.
import type { Campaign, Combatant, Encounter, Monster } from "./persistence/campaign";

export const ARMOR_REDUCTION = { none: 0, medium: 10, heavy: 20 } as const;

/** Damage a monster actually takes after armor. Crits ignore armor. */
export function damageAfterArmor(amount: number, armor: Combatant["armor"], crit: boolean): number {
  const n = Math.max(0, Math.floor(amount));
  return crit ? n : Math.max(0, n - ARMOR_REDUCTION[armor]);
}

/** Combatants for an encounter: heroes first (in the order given), then each monster, numbered. */
export function combatantsFor(encounter: Encounter, monsters: Monster[], heroNames: string[], newId: () => string): Combatant[] {
  const names = heroNames.map((n) => n.trim()).filter(Boolean);
  const out: Combatant[] = names.map((name) => ({ id: newId(), kind: "hero", name, armor: "none", minion: false, done: false, defeated: false, conditions: [] }));
  // Legendary HP is per hero: the heroes named for the fight, else the encounter's hero levels.
  const heroCount = Math.max(1, names.length || encounter.heroLevels.length);
  for (const entry of encounter.monsters) {
    const m = monsters.find((x) => x.id === entry.monsterId);
    if (!m) continue;
    for (let i = 1; i <= entry.count; i++) {
      out.push({
        id: newId(),
        kind: "monster",
        name: entry.count > 1 ? `${m.name} ${i}` : m.name,
        monsterId: m.id,
        ...hpFor(m, heroCount),
        armor: m.armor,
        minion: m.minion,
        done: false,
        defeated: false,
        conditions: [],
      });
    }
  }
  return out;
}

function hpFor(m: Monster, heroCount: number): Partial<Combatant> {
  if (m.minion) return {};
  const hp = m.hpPerHero !== undefined ? m.hpPerHero * heroCount : m.hp;
  return {
    ...(hp === undefined ? {} : { hp, hpMax: hp }),
    ...(m.legendary ? { legendary: true } : {}),
    ...(m.lastStandHpPerHero !== undefined ? { lastStandHp: m.lastStandHpPerHero * heroCount } : {}),
  };
}

/** A Legendary monster at half HP or less, before its Last Stand. */
export function isBloodied(c: Combatant): boolean {
  return Boolean(c.legendary) && !c.lastStand && c.hp !== undefined && c.hpMax !== undefined && c.hp > 0 && c.hp <= c.hpMax / 2;
}

/** Starts a Legendary monster's Last Stand: it regains its Last Stand HP and is Dying until that is gone. */
export function startLastStand(draft: Campaign, id: string): void {
  const c = find(draft, id);
  if (!c || c.lastStand || c.lastStandHp === undefined) return;
  c.lastStand = true;
  c.hp = c.lastStandHp;
  c.hpMax = c.lastStandHp;
  c.defeated = false;
}

export function startEncounter(draft: Campaign, encounterId: string, heroNames: string[], newId: () => string): void {
  const enc = draft.encounters.find((e) => e.id === encounterId);
  if (!enc) return;
  draft.tracker = { active: true, round: 1, encounterId, combatants: combatantsFor(enc, draft.monsters, heroNames, newId) };
}

export function endEncounter(draft: Campaign): void {
  draft.tracker = { active: false, round: 0, combatants: [] };
}

const find = (draft: Campaign, id: string) => draft.tracker.combatants.find((c) => c.id === id);

/** Applies damage; returns what was actually taken (after armor), or null if the combatant is gone. */
export function damageCombatant(draft: Campaign, id: string, amount: number, crit: boolean): number | null {
  const c = find(draft, id);
  if (!c) return null;
  if (c.kind === "hero") return null; // Heroes track their own HP on their sheets.
  const taken = damageAfterArmor(amount, c.armor, crit);
  if (c.minion) {
    if (taken > 0) c.defeated = true;
    return taken;
  }
  if (c.hp !== undefined) {
    c.hp = Math.max(0, c.hp - taken);
    if (c.hp === 0) {
      // Reduced to 0: a Legendary monster with Last Stand HP starts its Last Stand instead of
      // dying (damage past 0 isn't carried over: the book doesn't say it is).
      if (c.lastStandHp !== undefined && !c.lastStand) startLastStand(draft, c.id);
      else c.defeated = true;
    }
  }
  return taken;
}

export function healCombatant(draft: Campaign, id: string, amount: number): void {
  const c = find(draft, id);
  if (!c || c.hp === undefined || c.hpMax === undefined) return;
  c.hp = Math.min(c.hpMax, c.hp + Math.max(0, Math.floor(amount)));
  if (c.hp > 0) c.defeated = false;
}

export function setDefeated(draft: Campaign, id: string, defeated: boolean): void {
  const c = find(draft, id);
  if (c) c.defeated = defeated;
}

export function toggleDone(draft: Campaign, id: string): void {
  const c = find(draft, id);
  if (c) c.done = !c.done;
}

/** Starts the next round: everyone may act again. */
export function nextRound(draft: Campaign): void {
  draft.tracker.round += 1;
  for (const c of draft.tracker.combatants) c.done = false;
}

export function moveCombatant(draft: Campaign, id: string, by: -1 | 1): void {
  const list = draft.tracker.combatants;
  const i = list.findIndex((c) => c.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return;
  const a = list[i];
  const b = list[j];
  if (!a || !b) return;
  list[i] = b;
  list[j] = a;
}

export function addCondition(draft: Campaign, id: string, condition: string): void {
  const c = find(draft, id);
  if (c && condition && !c.conditions.includes(condition)) c.conditions.push(condition);
}

export function removeCondition(draft: Campaign, id: string, condition: string): void {
  const c = find(draft, id);
  if (c) c.conditions = c.conditions.filter((x) => x !== condition);
}

export function addCombatant(draft: Campaign, combatant: Combatant): void {
  draft.tracker.combatants.push(combatant);
}

export function removeCombatant(draft: Campaign, id: string): void {
  draft.tracker.combatants = draft.tracker.combatants.filter((c) => c.id !== id);
}
