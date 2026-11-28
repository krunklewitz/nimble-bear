// Content schema: every rule and game entry is data validated here (DESIGN.md §4).
// Every entry carries a SourceRef pointing at a PDF in reference/. Nothing is filled in
// from memory: unclear items are marked status "unverified" and logged in RULES_QUESTIONS.md.
import { z } from "zod";

export const STAT_IDS = ["STR", "DEX", "INT", "WIL"] as const;
export const Stat = z.enum(STAT_IDS);
export type StatId = z.infer<typeof Stat>;

/** Lowercase dotted ids, e.g. "feature.cheat.sneak-attack". */
export const Id = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "ids are lowercase words joined by . or -");

export const SourceRef = z
  .object({
    file: z.string().regex(/\.pdf$/),
    version: z.string(),
    pdfPage: z.number().int().min(1),
    printedPage: z.number().int().min(1),
    status: z.enum(["verified", "unverified"]),
    /** Why an entry is unverified, or anything a reviewer should know. */
    note: z.string().optional(),
  })
  .strict();

/**
 * Formula string in the formula language (src/rules/formula.ts): numbers, LVL, KEY, STR, DEX,
 * INT, WIL, var.<name>, + - * ( ), min(), max(), floor(), half(), and dice terms like "1d6",
 * "2d4+DEX", "WIL d20" (= WIL × d20), "d66". Checked by tests, not by this regex.
 */
export const Formula = z.string().min(1);

export const Trigger = z.enum([
  "safeRest",
  "fieldRest",
  "initiative",
  "combatEnd",
  "turnStart",
  "turnEnd",
  "roundEnd",
  "damageTaken",
  "woundGained",
  "healedToMax",
  "levelUp",
  "manual",
]);

export const Per = z.enum(["turn", "round", "encounter", "safeRest", "fieldRest", "day", "minute"]);

export const Limit = z.object({ uses: Formula, per: Per }).strict();

/**
 * Conditions on the hero's own state are checked automatically ("self.*").
 * Anything about targets or the battlefield is a toggle the player flips ("situation").
 */
export const Predicate = z.union([
  z.enum(["self.unarmored", "self.dying", "self.bloodied", "self.fullHp", "self.noShield", "self.wieldingBlade"]),
  z.object({ situation: z.string().min(1) }).strict(),
]);

export const StatTarget = z
  .string()
  .regex(
    /^(stat\.(STR|DEX|INT|WIL)|skill\.[a-z]+|skills\.all|initiative|speed|defense|maxHp|maxWounds|maxHitDice|hitDieSize|maxMana|inventorySlots|languages|saveDc|damage\.(all|melee|ranged|crit)|var\.[a-zA-Z]+)$/,
  );

export const RollDef = z
  .object({
    kind: z.enum(["attack", "damage", "heal", "check", "save", "aoe", "flat", "other"]),
    dice: Formula,
    damageType: z.string().optional(),
    ignoresArmor: z.boolean().optional(),
    /** Can't crit (e.g. AoE, minions). */
    noCrit: z.boolean().optional(),
    /** Rolls 1 additional die on crit (Vicious). */
    vicious: z.boolean().optional(),
    /** Saving throw targets make, if any. */
    save: z.object({ stat: Stat, half: z.boolean().optional() }).strict().optional(),
  })
  .strict();

export const ActionDef = z
  .object({
    id: Id,
    name: z.string(),
    kind: z.enum(["attack", "spell", "ability", "reaction", "free", "passive"]),
    /** Who makes it, for Rushed Attacks (a companion counts as a different creature). Default: the hero. */
    creature: z.enum(["hero", "companion"]).optional(),
    /** Actions it costs (0 = free/reaction-on-trigger). Omit for passives. */
    actions: z.number().int().min(0).max(3).optional(),
    cost: z.object({ mana: Formula.optional(), resource: z.object({ id: Id, amount: Formula }).strict().optional() }).strict().optional(),
    roll: RollDef.optional(),
    reach: Formula.optional(),
    range: Formula.optional(),
    aoe: z.boolean().optional(),
    limit: Limit.optional(),
    /** Verbatim rules text. */
    text: z.string(),
  })
  .strict();

export const ResourceDef = z
  .object({
    id: Id,
    name: z.string(),
    max: Formula,
    recover: z.array(z.object({ on: Trigger, amount: z.union([Formula, z.literal("all")]) }).strict()),
    /** Triggers that empty it (e.g. Momentum: damageTaken, combatEnd). */
    lose: z.array(Trigger).optional(),
    /** `max` is what you gain, not a cap: extra gains can go above it (Zephyr Bursts of Speed + Reactive Force). */
    uncapped: z.boolean().optional(),
    /** Starts at 0 until gained (combat-only resources such as Momentum), instead of starting full. */
    startsEmpty: z.boolean().optional(),
    /** Dice-pool resources: the die, and whether it's rolled when gained or when spent. */
    dice: z.object({ die: Formula, rolled: z.enum(["gained", "spent"]) }).strict().optional(),
  })
  .strict();

export const ChoiceDef = z
  .object({
    id: Id,
    prompt: z.string(),
    count: z.number().int().min(1),
    from: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("pool"), pool: Id }).strict(),
      z.object({ kind: z.literal("options"), options: z.array(z.object({ id: Id, label: z.string(), effects: z.lazy(() => z.array(Effect)).optional() }).strict()) }).strict(),
      z.object({ kind: z.literal("subclass") }).strict(),
      z.object({ kind: z.literal("stat"), stats: z.array(Stat).min(1), amount: z.number().int() }).strict(),
      z.object({ kind: z.literal("save") , from: z.enum(["neutral", "disadvantaged"]), to: z.enum(["advantaged", "neutral"]) }).strict(),
      z.object({ kind: z.literal("spell"), school: Id.optional(), tier: z.union([z.literal("utility"), z.literal("cantrip"), z.number().int().min(1).max(9)]) }).strict(),
      z.object({ kind: z.literal("size"), sizes: z.array(z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"])).min(1) }).strict(),
      z.object({ kind: z.literal("skillPoints"), amount: z.number().int() }).strict(),
      /** Pick a spell school (e.g. Hexbinder Coven: "Choose 1 spell school a close ally knows"). */
      z.object({ kind: z.literal("school"), schools: z.array(Id).optional(), /** Only tiered spells, not cantrips (Coven). */ tieredOnly: z.boolean().optional() }).strict(),
      z.object({ kind: z.literal("text") }).strict(),
    ]),
  })
  .strict();

export const RollOptionDef = z
  .object({
    id: Id,
    label: z.string(),
    on: z.enum(["attack", "damage", "check", "save", "initiative", "heal", "any"]),
    change: z.enum(["advantage", "disadvantage", "addDice", "add", "floor", "setPrimary", "critRange", "missRange", "reroll", "maximize"]),
    value: Formula.optional(),
    /** Narrows `on`, e.g. a skill id, a stat, "melee", "thrown". */
    scope: z.string().optional(),
    when: Predicate.optional(),
    mode: z.enum(["auto", "toggle"]),
    limit: Limit.optional(),
  })
  .strict();

type EffectT =
  | { type: "modifier"; target: string; op: "add" | "set" | "max" | "min" | "stepDie"; value: string; when?: z.infer<typeof Predicate> | undefined }
  | { type: "setVar"; var: string; value: string }
  | { type: "save"; stat: z.infer<typeof Stat>; set: "advantaged" | "disadvantaged" | "neutral" }
  | { type: "grant"; action: z.infer<typeof ActionDef> }
  | { type: "resource"; resource: z.infer<typeof ResourceDef> }
  | { type: "choice"; choice: z.infer<typeof ChoiceDef> }
  | { type: "spells"; schools?: string[] | undefined; list?: string | undefined; maxTier?: number | undefined; cantrips?: boolean | undefined; extra?: string[] | undefined; utility?: "all" | undefined; replaceSchool?: { from: string; to: string } | undefined }
  | { type: "rollOption"; option: z.infer<typeof RollOptionDef> }
  | { type: "replace"; features: string[]; with?: string[] | undefined }
  | { type: "replacePool"; from: string; to: string; except?: string[] | undefined }
  | { type: "grantOptions"; pool: string; ids: string[] }
  | { type: "resourceChange"; resource: string; removeLose?: z.infer<typeof Trigger>[] | undefined }
  | { type: "proficiency"; armor?: string[] | undefined; shields?: boolean | undefined; weapons?: string[] | undefined; languages?: string[] | undefined; unarmedCrit?: boolean | undefined }
  | { type: "hook"; on: z.infer<typeof Trigger>; text: string; handler?: string | undefined }
  | { type: "handler"; name: string }
  | { type: "text" };

export const Effect: z.ZodType<EffectT> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("modifier"), target: StatTarget, op: z.enum(["add", "set", "max", "min", "stepDie"]), value: Formula, when: Predicate.optional() }).strict(),
    z.object({ type: z.literal("setVar"), var: z.string().regex(/^[a-zA-Z]+$/), value: Formula }).strict(),
    z.object({ type: z.literal("save"), stat: Stat, set: z.enum(["advantaged", "disadvantaged", "neutral"]) }).strict(),
    z.object({ type: z.literal("grant"), action: ActionDef }).strict(),
    z.object({ type: z.literal("resource"), resource: ResourceDef }).strict(),
    z.object({ type: z.literal("choice"), choice: ChoiceDef }).strict(),
    z
      .object({
        type: z.literal("spells"),
        schools: z.array(Id).optional(),
        list: Id.optional(),
        maxTier: z.number().int().min(0).max(9).optional(),
        cantrips: z.boolean().optional(),
        extra: z.array(Id).optional(),
        utility: z.literal("all").optional(),
        replaceSchool: z.object({ from: Id, to: Id }).strict().optional(),
      })
      .strict(),
    z.object({ type: z.literal("rollOption"), option: RollOptionDef }).strict(),
    z.object({ type: z.literal("replace"), features: z.array(Id).min(1), with: z.array(Id).optional() }).strict(),
    /** Choices from pool `from` offer pool `to` instead (Honorseeker: Honorable Gambits for Underhanded Abilities); `except` lists choice ids left alone. */
    z.object({ type: z.literal("replacePool"), from: Id, to: Id, except: z.array(Id).optional() }).strict(),
    /** Options a feature grants outright ("You know the Withered and Frenzied Afflictions"); they're then hidden from later picks. */
    z.object({ type: z.literal("grantOptions"), pool: Id, ids: z.array(Id).min(1) }).strict(),
    /** Changes another feature's resource, e.g. Way of Pain: "Damage no longer causes you to lose Momentum". */
    z.object({ type: z.literal("resourceChange"), resource: Id, removeLose: z.array(Trigger).optional() }).strict(),
    z
      .object({
        type: z.literal("proficiency"),
        armor: z.array(z.enum(["cloth", "leather", "mail", "plate"])).optional(),
        shields: z.boolean().optional(),
        weapons: z.array(z.string()).optional(),
        languages: z.array(Id).optional(),
        unarmedCrit: z.boolean().optional(),
      })
      .strict(),
    z.object({ type: z.literal("hook"), on: Trigger, text: z.string(), handler: z.string().optional() }).strict(),
    z.object({ type: z.literal("handler"), name: z.string().regex(/^[a-z]+(\.[a-zA-Z]+)+$/) }).strict(),
    z.object({ type: z.literal("text") }).strict(),
  ]),
);
export type Effect = EffectT;

export const FeatureDef = z
  .object({
    id: Id,
    name: z.string(),
    /** Verbatim rules text. */
    text: z.string(),
    effects: z.array(Effect),
    /** full: the sheet handles it; partial: some manual steps; manual: text + manual controls only. */
    automation: z.enum(["full", "partial", "manual"]),
    /** What the player does by hand when automation isn't full. */
    manualNote: z.string().optional(),
    /**
     * What this feature changes, so its text is shown with that entry on the Combat tab:
     * feature, spell or action ids, `attack.<weapon id>` for weapon attacks, or `reaction.<name>`
     * (reaction.defend, reaction.interpose, reaction.opportunity-attack, reaction.help).
     * Taken only from targets the feature's rules text names.
     */
    modifies: z.array(Id).optional(),
    /**
     * false: never shown on the Combat tab (story, exploration, rest or skill-check features).
     * Left out, the Combat tab decides from the feature's effects and text (rules/combat.ts).
     */
    combat: z.boolean().optional(),
    source: SourceRef,
  })
  .strict();

export const Size = z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]);

export const AncestryDef = z
  .object({
    id: Id,
    name: z.string(),
    rarity: z.enum(["common", "uncommon", "exotic"]),
    sizes: z.array(Size).min(1),
    /** Flavor paragraph (verbatim). */
    description: z.string(),
    features: z.array(FeatureDef).min(1),
    source: SourceRef,
  })
  .strict();

export const BackgroundDef = z
  .object({
    id: Id,
    name: z.string(),
    /** e.g. "Req. 0 or negative INT at character creation" → { stat: "INT", max: 0 }. */
    requires: z.object({ stat: Stat, max: z.number().int() }).strict().optional(),
    features: z.array(FeatureDef).min(1),
    source: SourceRef,
  })
  .strict();

export const ArmorDef = z
  .object({
    id: Id,
    name: z.string(),
    category: z.enum(["cloth", "leather", "mail", "plate"]),
    /** Defense formula, e.g. "3+DEX", "6+min(DEX,2)", "18". */
    defense: Formula,
    requiresStr: z.number().int().optional(),
    cost: z.string(),
    source: SourceRef,
  })
  .strict();

export const ShieldDef = z
  .object({ id: Id, name: z.string(), defense: z.number().int(), requiresStr: z.number().int().optional(), cost: z.string(), source: SourceRef })
  .strict();

export const WeaponDef = z
  .object({
    id: Id,
    name: z.string(),
    group: z.enum(["melee", "ranged"]),
    /** e.g. "1d4+DEX". Weapons usable with either stat list both: ["1d6+STR", "1d6+DEX"]. */
    damage: z.array(Formula).min(1),
    damageType: z.array(z.string()).min(1),
    /** Verbatim property list, e.g. "2-handed (1-handed: Req. 2 STR), Reach 2". */
    propertiesText: z.string(),
    properties: z
      .object({
        twoHanded: z.boolean().optional(),
        oneHandedRequiresStr: z.number().int().optional(),
        requiresStr: z.number().int().optional(),
        light: z.boolean().optional(),
        vicious: z.boolean().optional(),
        reach: z.number().int().optional(),
        range: z.number().int().optional(),
        thrown: z.number().int().optional(),
        load: z.number().int().optional(),
        stack: z.number().int().optional(),
      })
      .strict(),
    /** Weapon proficiency tags classes refer to, e.g. "blade", "str", "dex", "melee". */
    tags: z.array(z.string()),
    cost: z.string(),
    source: SourceRef,
  })
  .strict();

export const GearDef = z
  .object({ id: Id, name: z.string(), slots: z.number().min(0).optional(), cost: z.string().optional(), text: z.string(), source: SourceRef })
  .strict();

export const SpellDef = z
  .object({
    id: Id,
    name: z.string(),
    /** School id ("radiant", "necrotic", "fire"…) or a class list ("hexbinder"). */
    school: Id,
    /** 0 = cantrip. Utility spells use tier "utility". */
    tier: z.union([z.number().int().min(0).max(9), z.literal("utility")]),
    /** Actions to cast; non-combat durations like "1 Day" go in castingTime. */
    actions: z.number().int().min(0).max(3).optional(),
    castingTime: z.string().optional(),
    aoe: z.boolean(),
    /** "Castable only while Defending", "(1/round)", "Reaction: …", etc. (verbatim). */
    restriction: z.string().optional(),
    concentration: z.string().optional(),
    reach: z.string().optional(),
    range: z.string().optional(),
    roll: RollDef.optional(),
    /** Full verbatim rules text, excluding the Upcast/High Levels lines. */
    text: z.string(),
    upcast: z.string().optional(),
    highLevels: z.string().optional(),
    limit: Limit.optional(),
    source: SourceRef,
  })
  .strict();

export const ClassDef = z
  .object({
    id: Id,
    name: z.string(),
    keyStats: z.tuple([Stat, Stat]),
    secondaryStats: z.tuple([Stat, Stat]),
    hitDie: z.enum(["d4", "d6", "d8", "d10", "d12", "d20"]),
    startingHp: z.number().int(),
    saves: z.object({ advantaged: Stat, disadvantaged: Stat }).strict(),
    armorText: z.string(),
    weaponsText: z.string(),
    startingGearText: z.string(),
    /** Item ids from equipment data for the starting kit. */
    startingGear: z.array(z.object({ id: Id, qty: z.number().int().min(1) }).strict()),
    proficiency: z
      .object({
        armor: z.array(z.enum(["cloth", "leather", "mail", "plate"])),
        shields: z.boolean(),
        weapons: z.array(z.string()),
      })
      .strict(),
    vars: z.record(z.string(), Formula),
    /** Feature ids gained at each level ("1".."20"). Phase 3 fills 1–3. */
    levels: z.record(z.string().regex(/^([1-9]|1[0-9]|20)$/), z.array(Id)),
    subclassLevels: z.array(z.number().int()),
    features: z.array(FeatureDef),
    optionPools: z.record(Id, z.array(FeatureDef)),
    /** Retraining rule text, e.g. "Trade Secrets". */
    retrainText: z.string().optional(),
    source: SourceRef,
  })
  .strict();

export const SubclassDef = z
  .object({
    id: Id,
    classId: Id,
    name: z.string(),
    tagline: z.string().optional(),
    storyBased: z.boolean(),
    levels: z.record(z.string().regex(/^([1-9]|1[0-9]|20)$/), z.array(Id)),
    features: z.array(FeatureDef),
    optionPools: z.record(Id, z.array(FeatureDef)).optional(),
    source: SourceRef,
  })
  .strict();

export const ConditionDef = z.object({ id: Id, name: z.string(), text: z.string(), source: SourceRef }).strict();

/**
 * A rule that applies to equipment, shown with every item it applies to (verbatim book text).
 * appliesTo picks the items: a weapon property (WeaponDef.properties key), an armor category,
 * one item id, or a whole kind of item.
 */
export const EquipmentRuleDef = z
  .object({
    id: Id,
    name: z.string(),
    appliesTo: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("weaponProperty"), property: z.enum(["twoHanded", "oneHandedRequiresStr", "requiresStr", "light", "vicious", "reach", "range", "thrown", "load", "stack"]) }).strict(),
      z.object({ kind: z.literal("armorCategory"), category: z.enum(["cloth", "leather", "mail", "plate"]) }).strict(),
      z.object({ kind: z.literal("item"), id: Id }).strict(),
      z.object({ kind: z.literal("allArmor") }).strict(),
      z.object({ kind: z.literal("allShields") }).strict(),
      z.object({ kind: z.literal("allWeapons") }).strict(),
      z.object({ kind: z.literal("meleeWeapons") }).strict(),
      z.object({ kind: z.literal("rangedWeapons") }).strict(),
      z.object({ kind: z.literal("allGear") }).strict(),
    ]),
    /** Verbatim rules text. */
    text: z.string(),
    /** True for optional rules (e.g. Deflect!). */
    optional: z.boolean().optional(),
    source: SourceRef,
  })
  .strict();
export type EquipmentRuleDefT = z.infer<typeof EquipmentRuleDef>;

/** Core character rules (Core Rules: Character Sheet, Leveling Up, Glossary). */
export const CoreRulesDef = z
  .object({
    skills: z.array(z.object({ id: Id, name: z.string(), stat: Stat }).strict()).length(10),
    statArrays: z.array(z.object({ id: Id, name: z.string(), values: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]) }).strict()),
    defaults: z
      .object({
        speed: z.number().int(),
        maxWounds: z.number().int(),
        inventorySlots: Formula,
        initiative: Formula,
        unarmoredDefense: Formula,
        hitDiceMax: Formula,
        saveDc: Formula,
        startingSkillPoints: z.number().int(),
        skillPointsPerLevel: z.number().int(),
        startingGold: z.number().int(),
        extraLanguagesPerInt: z.number().int(),
      })
      .strict(),
    levelUpHpAverage: z.record(z.enum(["d4", "d6", "d8", "d10", "d12"]), z.number().int()),
    hitDieSteps: z.array(z.string()),
    initiativeActions: z.array(z.object({ minTotal: z.number().int().nullable(), maxTotal: z.number().int().nullable(), actions: z.number().int() }).strict()),
    languages: z.array(z.object({ id: Id, name: z.string(), spokenBy: z.string() }).strict()),
    /** Where each part above comes from, keyed by field name. */
    sources: z.record(z.string(), SourceRef),
  })
  .strict();
export type CoreRulesDefT = z.infer<typeof CoreRulesDef>;

/** Boons (GMG p.75): Minor, Major and Epic. Every class gets an Epic Boon at level 19. Pool ids: boons.minor, boons.major, boons.epic. */
export const BoonsDef = z
  .object({
    minor: z.array(FeatureDef),
    major: z.array(FeatureDef),
    epic: z.array(FeatureDef),
  })
  .strict();
export type BoonsDefT = z.infer<typeof BoonsDef>;

export type SourceRefT = z.infer<typeof SourceRef>;
export type FeatureDefT = z.infer<typeof FeatureDef>;
export type AncestryDefT = z.infer<typeof AncestryDef>;
export type BackgroundDefT = z.infer<typeof BackgroundDef>;
export type ArmorDefT = z.infer<typeof ArmorDef>;
export type ShieldDefT = z.infer<typeof ShieldDef>;
export type WeaponDefT = z.infer<typeof WeaponDef>;
export type GearDefT = z.infer<typeof GearDef>;
export type SpellDefT = z.infer<typeof SpellDef>;
export type ClassDefT = z.infer<typeof ClassDef>;
export type SubclassDefT = z.infer<typeof SubclassDef>;
export type ConditionDefT = z.infer<typeof ConditionDef>;
export type ActionDefT = z.infer<typeof ActionDef>;
export type ResourceDefT = z.infer<typeof ResourceDef>;
export type ChoiceDefT = z.infer<typeof ChoiceDef>;
export type RollDefT = z.infer<typeof RollDef>;
export type RollOptionDefT = z.infer<typeof RollOptionDef>;
