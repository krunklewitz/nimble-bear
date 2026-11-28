// Derives the full sheet from content + a character's choices and play state.
// Pure: no React, storage or SDK. Rules sources (Core Rules 3.2):
// stats/skills p.6–7, saves & save DC p.8, HP/Wounds/Hit Dice p.9, character sheet defaults p.20,
// leveling p.21, starting skill points p.56 (Glossary), armor & Defense p.32–33, weapons p.34–35,
// magic p.44–45. Class and ancestry rules come from their own data (with source notes).
import type { Content } from "../data/content";
import type {
  ActionDefT,
  AncestryDefT,
  BackgroundDefT,
  ChoiceDefT,
  ClassDefT,
  Effect,
  FeatureDefT,
  ResourceDefT,
  RollOptionDefT,
  SpellDefT,
  StatId,
  SubclassDefT,
} from "../data/schema";
import { STAT_IDS } from "../data/schema";
import { evalNumber, parseFormula, toDice, type DiceSpec, type Scope } from "./formula";
import type { Character } from "./persistence/character";

export type FeatureSource = "class" | "subclass" | "ancestry" | "background";
type Predicate = NonNullable<Extract<Effect, { type: "modifier" }>["when"]>;

export interface ActiveFeature {
  def: FeatureDefT;
  source: FeatureSource;
  /** Level gained (class/subclass features). */
  level?: number;
  /** Removed by another feature (e.g. Honorseeker). Its setVar effects still apply. */
  replacedBy?: string;
}

export interface PendingChoice {
  choice: ChoiceDefT;
  featureId: string;
  /** Where the selection is stored: "ancestry", "background", or a level number. */
  where: "ancestry" | "background" | number;
  selected: string[];
  /** Valid options right now (ids). Empty for free text. */
  options: { id: string; label: string }[];
}

export interface SheetAction {
  id: string;
  name: string;
  kind: ActionDefT["kind"] | "weapon";
  actions: number | undefined;
  /** Rollable dice, if any. */
  roll?: { kind: string; dice: DiceSpec; formula: string; damageType?: string | undefined; ignoresArmor?: boolean | undefined; canCrit: boolean; canMiss: boolean; vicious: boolean } | undefined;
  manaCost?: number | undefined;
  resourceCost?: { id: string; amount: number } | undefined;
  limit?: { max: number; per: string; used: number } | undefined;
  reach?: string | undefined;
  range?: string | undefined;
  text: string;
  sourceId: string;
}

export interface SheetSpell {
  def: SpellDefT;
  cost: number;
  castable: boolean;
}

export interface SheetResource {
  def: ResourceDefT;
  max: number;
  current: number;
}

export interface SheetToggle {
  id: string;
  label: string;
  on: boolean;
  /** What switching it on changes. */
  describes: string;
}

export interface Sheet {
  level: number;
  cls: ClassDefT | undefined;
  subclass: SubclassDefT | undefined;
  ancestry: AncestryDefT | undefined;
  background: BackgroundDefT | undefined;
  stats: Record<StatId, number>;
  key: number;
  saveDc: number;
  saves: Record<StatId, { mod: number; advantage: number }>;
  skills: { id: string; name: string; stat: StatId; total: number; points: number }[];
  hp: { current: number; max: number; temp: number };
  wounds: { current: number; max: number };
  dying: boolean;
  dead: boolean;
  bloodied: boolean;
  hitDice: { die: string; max: number; remaining: number };
  defense: { value: number; parts: { label: string; value: number }[]; armorProficient: boolean; shield: number };
  initiative: { mod: number; advantage: number };
  speed: number;
  size: string;
  inventorySlots: { max: number; used: number };
  languages: string[];
  extraLanguageSlots: number;
  mana: SheetResource | undefined;
  resources: SheetResource[];
  features: ActiveFeature[];
  actions: SheetAction[];
  spells: { schools: string[]; maxTier: number; known: SheetSpell[] };
  rollOptions: (RollOptionDefT & { sourceId: string })[];
  toggles: SheetToggle[];
  hooks: { on: string; text: string; sourceId: string }[];
  choices: PendingChoice[];
  vars: Record<string, string>;
  scope: Scope;
  warnings: string[];
  overridden: string[];
}

const stepDie = (die: string, steps: number, ladder: string[]): string => {
  const i = ladder.indexOf(die);
  if (i < 0) return die;
  return ladder[Math.min(ladder.length - 1, Math.max(0, i + steps))] ?? die;
};

/** Replaces var.<name> with its (possibly dice) formula in parentheses. */
export function expandVars(formula: string, vars: Record<string, string>): string {
  return formula.replace(/var\.([a-zA-Z]+)/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) throw new Error(`Unknown variable var.${name}`);
    return `(${v})`;
  });
}

function nestedEffects(effects: Effect[], selections: (choiceId: string) => string[]): Effect[] {
  const out: Effect[] = [];
  for (const e of effects) {
    out.push(e);
    if (e.type === "choice" && e.choice.from.kind === "options") {
      const picked = new Set(selections(e.choice.id));
      for (const opt of e.choice.from.options) if (picked.has(opt.id)) out.push(...nestedEffects(opt.effects ?? [], selections));
    }
  }
  return out;
}

/** Which classes/levels this character has (all levels are one class: no multiclassing). */
export function classOf(content: Content, c: Character): ClassDefT | undefined {
  const id = c.build.levels[0]?.classId;
  return id ? content.classes.get(id) : undefined;
}

export function derive(content: Content, c: Character): Sheet {
  const warnings: string[] = [];
  const level = Math.max(1, c.build.levels.length);
  const cls = classOf(content, c);
  const ancestry = c.build.ancestry ? content.ancestries.get(c.build.ancestry.id) : undefined;
  const background = c.build.background ? content.backgrounds.get(c.build.background.id) : undefined;
  if (c.build.ancestry && !ancestry) warnings.push(`Unknown ancestry ${c.build.ancestry.id}.`);
  if (c.build.background && !background) warnings.push(`Unknown background ${c.build.background.id}.`);

  // ---- selections (choice id → picked ids) ----
  const selectionMap = new Map<string, string[]>();
  for (const [k, v] of Object.entries(c.build.ancestry?.choices ?? {})) selectionMap.set(k, v);
  for (const [k, v] of Object.entries(c.build.background?.choices ?? {})) selectionMap.set(k, v);
  for (const rec of c.build.levels) for (const [k, v] of Object.entries(rec.choices)) selectionMap.set(k, v);
  const selections = (id: string) => selectionMap.get(id) ?? [];

  const subclassId = cls ? selections(`choice.${cls.id.replace(/^class\./, "")}.subclass`)[0] : undefined;
  const subclass = subclassId ? content.subclasses.get(subclassId) : undefined;

  // ---- active features ----
  const features: ActiveFeature[] = [];
  const featureLevel = new Map<string, number | "ancestry" | "background">();
  if (cls) {
    const byId = new Map(cls.features.map((f) => [f.id, f]));
    for (let l = 1; l <= level; l++) {
      for (const id of cls.levels[String(l)] ?? []) {
        const def = byId.get(id);
        if (def) {
          features.push({ def, source: "class", level: l });
          featureLevel.set(def.id, l);
        } else warnings.push(`Missing class feature ${id}.`);
      }
    }
  }
  if (subclass) {
    const byId = new Map(subclass.features.map((f) => [f.id, f]));
    for (let l = 1; l <= level; l++) {
      for (const id of subclass.levels[String(l)] ?? []) {
        const def = byId.get(id);
        if (def) {
          features.push({ def, source: "subclass", level: l });
          featureLevel.set(def.id, l);
        }
      }
    }
  }
  for (const def of ancestry?.features ?? []) {
    features.push({ def, source: "ancestry" });
    featureLevel.set(def.id, "ancestry");
  }
  for (const def of background?.features ?? []) {
    features.push({ def, source: "background" });
    featureLevel.set(def.id, "background");
  }

  // Replacements (e.g. Honorseeker gives up Sneak Attack).
  for (const f of features) {
    for (const e of f.def.effects) {
      if (e.type !== "replace") continue;
      for (const target of e.features) {
        const hit = features.find((x) => x.def.id === target);
        if (hit) hit.replacedBy = f.def.id;
      }
    }
  }

  const effectsOf = (f: ActiveFeature): Effect[] => {
    const all = nestedEffects(f.def.effects, selections);
    return f.replacedBy ? all.filter((e) => e.type === "setVar") : all;
  };

  // ---- vars (class scaling numbers): defaults, then setVar in level order ----
  const vars: Record<string, string> = { ...(cls?.vars ?? {}) };
  for (const f of features) for (const e of effectsOf(f)) if (e.type === "setVar") vars[e.var] = e.value;

  // ---- stats ----
  const stats = Object.fromEntries(STAT_IDS.map((s) => [s, c.build.stats?.assign[s] ?? 0])) as Record<StatId, number>;
  const choices: PendingChoice[] = [];
  for (const f of features) {
    if (f.replacedBy) continue;
    for (const e of effectsOf(f)) {
      if (e.type !== "choice") continue;
      const where = featureLevel.get(f.def.id) ?? "ancestry";
      const picked = selections(e.choice.id);
      if (e.choice.from.kind === "stat") for (const s of picked) if ((STAT_IDS as readonly string[]).includes(s)) stats[s as StatId] += e.choice.from.amount;
      choices.push({ choice: e.choice, featureId: f.def.id, where, selected: picked, options: [] });
    }
  }
  const key = cls ? Math.max(stats[cls.keyStats[0]], stats[cls.keyStats[1]]) : 0;
  const baseScope: Scope = { LVL: level, KEY: key, ...stats };
  const scope: Scope = { ...baseScope };

  // ---- predicates & toggles ----
  const hpMaxPre = c.build.levels.reduce((s, l) => s + l.hp.value, 0);
  const equipped = c.play.inventory.filter((i) => i.equipped && i.itemId);
  const wornArmor = equipped.map((i) => (i.itemId ? content.armor.get(i.itemId) : undefined)).find(Boolean);
  const heldShield = equipped.map((i) => (i.itemId ? content.shields.get(i.itemId) : undefined)).find(Boolean);
  const toggles: SheetToggle[] = [];
  const toggleKey = (p: Predicate & { situation: string }, sourceId: string) => `toggle:${sourceId}:${p.situation}`;
  const holds = (p: Predicate | undefined, sourceId: string, describes: string, hpMax: number): boolean => {
    if (p === undefined) return true;
    if (typeof p === "object") {
      const id = toggleKey(p, sourceId);
      const on = c.play.flags[id] === true;
      if (!toggles.some((t) => t.id === id)) toggles.push({ id, label: p.situation, on, describes });
      return on;
    }
    switch (p) {
      case "self.unarmored":
        return !wornArmor;
      case "self.noShield":
        return !heldShield;
      case "self.dying":
        return c.play.hp <= 0;
      case "self.bloodied":
        return c.play.hp <= Math.floor(hpMax / 2);
      case "self.fullHp":
        return c.play.hp >= hpMax;
      case "self.wieldingBlade":
        return false; // "blade" isn't defined yet (RQ-008)
    }
  };

  // ---- modifiers ----
  interface Mod { op: "add" | "set" | "max" | "min" | "stepDie"; value: string; label: string }
  const mods = new Map<string, Mod[]>();
  const nameOf = new Map(features.map((f) => [f.def.id, f.def.name]));
  for (const f of features) {
    for (const e of effectsOf(f)) {
      if (e.type !== "modifier") continue;
      if (!holds(e.when, f.def.id, `${e.target} ${e.op} ${e.value}`, hpMaxPre)) continue;
      const list = mods.get(e.target) ?? [];
      list.push({ op: e.op, value: e.value, label: nameOf.get(f.def.id) ?? f.def.id });
      mods.set(e.target, list);
    }
  }
  const evalIn = (formula: string) => evalNumber(expandVars(formula, vars), scope);
  const apply = (target: string, base: number, parts?: { label: string; value: number }[]): number => {
    const list = mods.get(target) ?? [];
    let value = base;
    const sets = list.filter((m) => m.op === "set").map((m) => ({ v: evalIn(m.value), label: m.label }));
    if (sets.length) {
      const best = sets.reduce((a, b) => (b.v > a.v ? b : a));
      if (best.v > value || list.some((m) => m.op === "set")) {
        value = best.v;
        if (parts) parts.splice(0, parts.length, { label: best.label, value: best.v });
      }
    }
    for (const m of list) {
      if (m.op === "add") {
        const v = evalIn(m.value);
        value += v;
        parts?.push({ label: m.label, value: v });
      } else if (m.op === "max") value = Math.max(value, evalIn(m.value));
      else if (m.op === "min") value = Math.min(value, evalIn(m.value));
    }
    return value;
  };

  // Stat modifiers, then recompute KEY.
  for (const s of STAT_IDS) stats[s] = apply(`stat.${s}`, stats[s]);
  const keyFinal = cls ? Math.max(stats[cls.keyStats[0]], stats[cls.keyStats[1]]) : 0;
  Object.assign(scope, stats, { KEY: keyFinal });

  // ---- overrides ----
  const overridden: string[] = [];
  const ov = (path: string, value: number): number => {
    const o = c.overrides[path];
    if (typeof o === "number") {
      overridden.push(path);
      return o;
    }
    return value;
  };

  // ---- skills (Core p.20: stat value; p.56: 4 points at L1; p.21: +1 per level) ----
  const points = new Map<string, number>();
  for (const rec of c.build.levels) for (const [k, v] of Object.entries(rec.skillPoints)) points.set(k, (points.get(k) ?? 0) + v);
  const skillsAll = apply("skills.all", 0);
  const skills = content.core.skills.map((sk) => {
    const p = points.get(sk.id) ?? 0;
    const total = ov(`skill.${sk.id}`, apply(`skill.${sk.id}`, stats[sk.stat] + p) + skillsAll);
    return { id: sk.id, name: sk.name, stat: sk.stat, total, points: p };
  });

  // ---- saves (p.8): class ▲/▼, then ancestry/feature changes ----
  const saves = Object.fromEntries(STAT_IDS.map((s) => [s, { mod: stats[s], advantage: 0 }])) as Sheet["saves"];
  if (cls) {
    saves[cls.saves.advantaged].advantage = 1;
    saves[cls.saves.disadvantaged].advantage = -1;
  }
  for (const f of features) {
    for (const e of effectsOf(f)) if (e.type === "save") saves[e.stat].advantage = e.set === "advantaged" ? 1 : e.set === "disadvantaged" ? -1 : 0;
  }
  for (const pc of choices) {
    if (pc.choice.from.kind !== "save") continue;
    const fromState = pc.choice.from.from === "neutral" ? 0 : -1;
    const toState = pc.choice.from.to === "advantaged" ? 1 : 0;
    const candidates = STAT_IDS.filter((s) => saves[s].advantage === fromState);
    pc.options = candidates.map((s) => ({ id: s, label: s }));
    // Only one possible save (e.g. "Your disadvantaged save is neutral"): no need to ask.
    const picks = pc.selected.length ? pc.selected : candidates.length === pc.choice.count ? [...candidates] : [];
    pc.selected = picks;
    for (const s of picks) if ((STAT_IDS as readonly string[]).includes(s)) saves[s as StatId].advantage = toState;
  }
  for (const s of STAT_IDS) saves[s].mod = ov(`save.${s}`, saves[s].mod);
  const saveDc = ov("saveDc", apply("saveDc", evalIn(content.core.defaults.saveDc)));

  // ---- HP, Wounds, Hit Dice (p.9, p.20–21) ----
  const hpMax = ov("maxHp", apply("maxHp", hpMaxPre));
  const woundsMax = ov("maxWounds", apply("maxWounds", content.core.defaults.maxWounds));
  let die: string = cls?.hitDie ?? "d6";
  for (const m of mods.get("hitDieSize") ?? []) if (m.op === "stepDie") die = stepDie(die, evalIn(m.value), content.core.hitDieSteps);
  const hdMax = ov("maxHitDice", apply("maxHitDice", evalIn(content.core.defaults.hitDiceMax)));

  // ---- Defense (p.32–33) ----
  const defenseParts: { label: string; value: number }[] = [];
  let baseDefense: number;
  if (wornArmor) {
    baseDefense = evalIn(wornArmor.defense);
    defenseParts.push({ label: wornArmor.name, value: baseDefense });
  } else {
    baseDefense = evalIn(content.core.defaults.unarmoredDefense);
    defenseParts.push({ label: "DEX (unarmored)", value: baseDefense });
  }
  const shieldValue = heldShield ? heldShield.defense : 0;
  let defense = apply("defense", baseDefense, defenseParts);
  if (heldShield) {
    defense += shieldValue;
    defenseParts.push({ label: heldShield.name, value: shieldValue });
  }
  defense = ov("defense", defense);
  const armorProficient = !wornArmor || (cls?.proficiency.armor ?? []).includes(wornArmor.category);
  if (!armorProficient) warnings.push(`Not proficient with ${wornArmor?.name}: Defending costs 1 additional action (Core p.32).`);
  if (heldShield && cls && !cls.proficiency.shields) warnings.push(`Not proficient with shields.`);

  // ---- Initiative, Speed, size, slots, languages ----
  const initMod = ov("initiative", apply("initiative", evalIn(content.core.defaults.initiative)));
  const rollOptions: Sheet["rollOptions"] = [];
  const hooks: Sheet["hooks"] = [];
  for (const f of features) {
    for (const e of effectsOf(f)) {
      if (e.type === "rollOption") rollOptions.push({ ...e.option, sourceId: f.def.id });
      if (e.type === "hook") hooks.push({ on: e.on, text: e.text, sourceId: f.def.id });
    }
  }
  const initAdvantage = rollOptions.filter((o) => o.on === "initiative" && o.mode === "auto" && o.change === "advantage" && !o.when).length;
  const speed = ov("speed", apply("speed", content.core.defaults.speed));
  const sizeChoice = choices.find((pc) => pc.choice.from.kind === "size")?.selected[0];
  const size = sizeChoice ?? ancestry?.sizes[0] ?? "medium";
  const slotsMax = ov("inventorySlots", apply("inventorySlots", evalIn(content.core.defaults.inventorySlots)));
  let slotsUsed = 0;
  for (const it of c.play.inventory) {
    const w = it.itemId ? content.weapons.get(it.itemId) : undefined;
    const a = it.itemId ? content.armor.get(it.itemId) : undefined;
    const sh = it.itemId ? content.shields.get(it.itemId) : undefined;
    if (it.itemId === "weapon.unarmed-strike") continue;
    // Core p.20: 1 slot holds a 1-handed weapon, shield, worn armor, stack of javelins, 500 gp, or 2 potions;
    // 2 slots hold a 2-handed weapon or unworn armor.
    const per = w ? (w.properties.twoHanded ? 2 : 1) : a ? (it.equipped ? 1 : 2) : sh ? 1 : 1;
    const potion = !!it.itemId && it.itemId.startsWith("gear.") && /potion/i.test(it.itemId);
    slotsUsed += w?.properties.stack ? Math.ceil(it.qty / w.properties.stack) * per : potion ? Math.ceil(it.qty / 2) : per * it.qty;
  }
  slotsUsed += Math.ceil(c.play.gold / 500);
  const languages = new Set<string>(["common", ...c.build.languages]);
  for (const f of features) for (const e of effectsOf(f)) if (e.type === "proficiency") for (const l of e.languages ?? []) languages.add(l);
  const extraLanguageSlots = Math.max(0, stats.INT * content.core.defaults.extraLanguagesPerInt);

  // ---- resources & mana ----
  const resources: SheetResource[] = [];
  for (const f of features) {
    for (const e of effectsOf(f)) {
      if (e.type !== "resource") continue;
      const max = Math.max(0, evalIn(e.resource.max));
      const current = Math.min(max, c.play.resources[e.resource.id]?.current ?? max);
      resources.push({ def: e.resource, max: ov(`resource.${e.resource.id}`, max), current });
    }
  }
  const mana = resources.find((r) => r.def.id === "resource.mana");

  // ---- spells (p.44–45) ----
  let schools = new Set<string>();
  let maxTier = -1;
  const extraSpells = new Set<string>();
  const replaceSchools: { from: string; to: string }[] = [];
  let allUtility = false;
  for (const f of features) {
    for (const e of effectsOf(f)) {
      if (e.type !== "spells") continue;
      for (const s of e.schools ?? []) schools.add(s);
      if (e.maxTier !== undefined) maxTier = Math.max(maxTier, e.maxTier);
      if (e.cantrips) maxTier = Math.max(maxTier, 0);
      for (const x of e.extra ?? []) extraSpells.add(x);
      if (e.replaceSchool) replaceSchools.push(e.replaceSchool);
      if (e.utility === "all") allUtility = true;
    }
  }
  for (const r of replaceSchools) if (schools.delete(r.from)) schools.add(r.to);
  schools = new Set([...schools].sort());
  const chosenUtility = new Set<string>();
  for (const pc of choices) {
    if (pc.choice.from.kind !== "spell") continue;
    let school = pc.choice.from.school;
    for (const r of replaceSchools) if (school === r.from) school = r.to; // RQ-011
    const tier = pc.choice.from.tier;
    pc.options = [...content.spells.values()]
      .filter((s) => (school === undefined || s.school === school) && s.tier === tier)
      .map((s) => ({ id: s.id, label: s.name }));
    for (const id of pc.selected) chosenUtility.add(id);
  }
  const known: SheetSpell[] = [];
  for (const s of content.spells.values()) {
    const inSchool = schools.has(s.school);
    const tiered = typeof s.tier === "number" && s.tier <= maxTier && inSchool;
    const utility = s.tier === "utility" && (chosenUtility.has(s.id) || (allUtility && inSchool));
    if (tiered || utility || extraSpells.has(s.id)) {
      const cost = typeof s.tier === "number" ? s.tier : 0;
      known.push({ def: s, cost, castable: cost === 0 || (mana?.current ?? 0) >= cost });
    }
  }
  known.sort((a, b) => (a.cost - b.cost) || a.def.name.localeCompare(b.def.name));

  // ---- other choices' options ----
  for (const pc of choices) {
    const from = pc.choice.from;
    if (from.kind === "stat") pc.options = from.stats.map((s) => ({ id: s, label: s }));
    if (from.kind === "options") pc.options = from.options.map((o) => ({ id: o.id, label: o.label }));
    if (from.kind === "subclass" && cls) pc.options = [...content.subclasses.values()].filter((s) => s.classId === cls.id).map((s) => ({ id: s.id, label: s.name }));
    if (from.kind === "size") pc.options = from.sizes.map((s) => ({ id: s, label: s }));
  }

  // ---- actions ----
  const actions: SheetAction[] = [];
  const profWeapons = new Set(cls?.proficiency.weapons ?? []);
  let unarmedProficient = false;
  for (const f of features) for (const e of effectsOf(f)) if (e.type === "proficiency" && e.unarmedCrit) unarmedProficient = true;
  // "Heroes not proficient in Unarmed Strikes cannot crit" (Core p.34): only an explicit proficiency counts.
  const proficientWith = (w: { id: string; tags: string[] }) =>
    w.id === "weapon.unarmed-strike" ? unarmedProficient : w.tags.some((t) => profWeapons.has(t));
  // Everyone can make an Unarmed Strike (Core p.34), carried or not.
  const unarmed = content.weapons.get("weapon.unarmed-strike");
  const weaponIds = new Set(c.play.inventory.filter((i) => i.itemId && content.weapons.has(i.itemId)).map((i) => i.itemId as string));
  if (unarmed) weaponIds.add(unarmed.id);
  for (const wid of weaponIds) {
    const w = content.weapons.get(wid);
    if (!w) continue;
    const best = w.damage.reduce((a, b) => (evalNumber(b.replace(/^\d*d\d+/, "0"), scope) > evalNumber(a.replace(/^\d*d\d+/, "0"), scope) ? b : a));
    const prof = proficientWith(w);
    actions.push({
      id: `attack.${w.id}`,
      name: w.name,
      kind: "weapon",
      actions: 1,
      roll: { kind: "damage", dice: toDice(best, scope), formula: best, damageType: w.damageType.join("/"), canCrit: prof, canMiss: true, vicious: w.properties.vicious === true },
      reach: w.properties.reach !== undefined ? String(w.properties.reach) : w.group === "melee" ? "1" : undefined,
      range: w.properties.range !== undefined ? String(w.properties.range) : w.properties.thrown !== undefined ? `${w.properties.thrown} (thrown)` : undefined,
      text: `${w.propertiesText}${prof ? "" : " Not proficient: can't crit (Core p.32)."}`,
      sourceId: w.id,
    });
  }
  const limitOf = (id: string, l: ActionDefT["limit"]) => (l ? { max: Math.max(0, evalIn(l.uses)), per: l.per, used: c.play.uses[id] ?? 0 } : undefined);
  for (const f of features) {
    for (const e of effectsOf(f)) {
      if (e.type !== "grant") continue;
      const a = e.action;
      let roll: SheetAction["roll"];
      if (a.roll) {
        const formula = expandVars(a.roll.dice, vars);
        parseFormula(formula);
        roll = {
          kind: a.roll.kind,
          dice: toDice(formula, scope),
          formula,
          damageType: a.roll.damageType,
          ignoresArmor: a.roll.ignoresArmor,
          canCrit: a.roll.kind === "damage" && !a.roll.noCrit,
          canMiss: a.roll.kind === "damage",
          vicious: a.roll.vicious === true,
        };
      }
      actions.push({
        id: a.id,
        name: a.name,
        kind: a.kind,
        actions: a.actions,
        roll,
        manaCost: a.cost?.mana !== undefined ? evalIn(a.cost.mana) : undefined,
        resourceCost: a.cost?.resource ? { id: a.cost.resource.id, amount: evalIn(a.cost.resource.amount) } : undefined,
        limit: limitOf(a.id, a.limit),
        reach: a.reach,
        range: a.range,
        text: a.text,
        sourceId: f.def.id,
      });
    }
  }

  // ---- state ----
  const hpCurrent = Math.min(c.play.hp, hpMax);
  return {
    level,
    cls,
    subclass,
    ancestry,
    background,
    stats,
    key: keyFinal,
    saveDc,
    saves,
    skills,
    hp: { current: hpCurrent, max: hpMax, temp: c.play.tempHp },
    wounds: { current: c.play.wounds, max: woundsMax },
    dying: hpCurrent <= 0 && c.play.wounds < woundsMax,
    dead: c.play.wounds >= woundsMax,
    bloodied: hpCurrent <= Math.floor(hpMax / 2),
    hitDice: { die, max: hdMax, remaining: Math.max(0, hdMax - c.play.hitDiceSpent) },
    defense: { value: defense, parts: defenseParts, armorProficient, shield: shieldValue },
    initiative: { mod: initMod, advantage: initAdvantage },
    speed,
    size,
    inventorySlots: { max: slotsMax, used: slotsUsed },
    languages: [...languages],
    extraLanguageSlots,
    mana,
    resources,
    features,
    actions,
    spells: { schools: [...schools], maxTier, known },
    rollOptions,
    toggles,
    hooks,
    choices,
    vars,
    scope,
    warnings,
    overridden,
  };
}
