// Loads and validates all bundled content once. Player-safe data only: no monsters
// (those stay in the GM's own file, DESIGN.md §7).
import ancestries from "./content/core/ancestries.json";
import armor from "./content/core/armor.json";
import backgrounds from "./content/core/backgrounds.json";
import conditions from "./content/core/conditions.json";
import gear from "./content/core/gear.json";
import rules from "./content/core/rules.json";
import shields from "./content/core/shields.json";
import weapons from "./content/core/weapons.json";
import cheat from "./content/classes/cheat.json";
import cheatSubclasses from "./content/classes/cheat-subclasses.json";
import shepherd from "./content/classes/shepherd.json";
import shepherdSubclasses from "./content/classes/shepherd-subclasses.json";
import fireSpells from "./content/spells/fire.json";
import necroticSpells from "./content/spells/necrotic.json";
import radiantSpells from "./content/spells/radiant.json";
import shepherdSpells from "./content/spells/shepherd.json";
import {
  AncestryDef,
  ArmorDef,
  BackgroundDef,
  ClassDef,
  ConditionDef,
  CoreRulesDef,
  GearDef,
  ShieldDef,
  SpellDef,
  SubclassDef,
  WeaponDef,
  type AncestryDefT,
  type ArmorDefT,
  type BackgroundDefT,
  type ClassDefT,
  type ConditionDefT,
  type CoreRulesDefT,
  type GearDefT,
  type ShieldDefT,
  type SpellDefT,
  type SubclassDefT,
  type WeaponDefT,
} from "./schema";

export interface Content {
  core: CoreRulesDefT;
  ancestries: Map<string, AncestryDefT>;
  backgrounds: Map<string, BackgroundDefT>;
  conditions: Map<string, ConditionDefT>;
  classes: Map<string, ClassDefT>;
  subclasses: Map<string, SubclassDefT>;
  armor: Map<string, ArmorDefT>;
  shields: Map<string, ShieldDefT>;
  weapons: Map<string, WeaponDefT>;
  gear: Map<string, GearDefT>;
  spells: Map<string, SpellDefT>;
  /** Content versions, recorded in saved characters. */
  versions: Record<string, string>;
}

const byId = <T extends { id: string }>(list: T[]): Map<string, T> => new Map(list.map((x) => [x.id, x]));

/** Builds the content set from raw JSON (exported for tests with custom data). */
export function buildContent(raw: {
  rules: unknown;
  ancestries: unknown;
  backgrounds: unknown;
  conditions: unknown;
  armor: unknown;
  shields: unknown;
  weapons: unknown;
  gear: unknown;
  classes: unknown[];
  subclasses: unknown[];
  spells: unknown[];
}): Content {
  const classes = raw.classes.map((c) => ClassDef.parse(c));
  return {
    core: CoreRulesDef.parse(raw.rules),
    ancestries: byId(AncestryDef.array().parse(raw.ancestries)),
    backgrounds: byId(BackgroundDef.array().parse(raw.backgrounds)),
    conditions: byId(ConditionDef.array().parse(raw.conditions)),
    armor: byId(ArmorDef.array().parse(raw.armor)),
    shields: byId(ShieldDef.array().parse(raw.shields)),
    weapons: byId(WeaponDef.array().parse(raw.weapons)),
    gear: byId(GearDef.array().parse(raw.gear)),
    classes: byId(classes),
    subclasses: byId(raw.subclasses.flatMap((s) => SubclassDef.array().parse(s))),
    spells: byId(raw.spells.flatMap((s) => SpellDef.array().parse(s))),
    versions: Object.fromEntries([["core", "3.2"], ...classes.map((c) => [c.id.replace(/^class\./, ""), c.source.version])]),
  };
}

let cached: Content | null = null;

/** The bundled content, validated on first use. */
export function getContent(): Content {
  cached ??= buildContent({
    rules,
    ancestries,
    backgrounds,
    conditions,
    armor,
    shields,
    weapons,
    gear,
    classes: [cheat, shepherd],
    subclasses: [cheatSubclasses, shepherdSubclasses],
    spells: [radiantSpells, necroticSpells, fireSpells, shepherdSpells],
  });
  return cached;
}
