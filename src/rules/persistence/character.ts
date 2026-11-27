// Character data, schema version 2 (DESIGN.md §5.1). v1 → v2: see migrations.ts. Stores choices and play state only;
// everything else is derived. Game-content IDs are plain strings here; they are checked
// against content data from Phase 3 on.
import { z } from "zod";

export const STATS = ["STR", "DEX", "INT", "WIL"] as const;
const Stat = z.enum(STATS);
const int = z.number().int();
const nonNegInt = int.nonnegative();
const Choices = z.record(z.string(), z.array(z.string()));

export const LevelRecordSchema = z
  .object({
    level: int.min(1).max(20),
    classId: z.string().min(1),
    hp: z.object({ method: z.enum(["starting", "roll", "average"]), value: int }).strict(),
    /** Skill point changes made at this level, by skill id. Level 1: the 4 starting points. Later: +1, and optionally a move (+1 to one, -1 from another). */
    skillPoints: z.record(z.string(), int),
    choices: Choices,
  })
  .strict();

export const CharacterSchema = z
  .object({
    id: z.string().min(1),
    revision: nonNegInt,
    createdAt: z.string(),
    updatedAt: z.string(),
    name: z.string().trim().min(1).max(80),
    /** Content versions used, e.g. { core: "3.2", cheat: "3.0" }. */
    content: z.record(z.string(), z.string()),
    build: z
      .object({
        stats: z
          .object({
            method: z.enum(["standard", "balanced", "minmax", "manual"]),
            assign: z.partialRecord(Stat, int),
          })
          .strict()
          .nullable(),
        ancestry: z.object({ id: z.string(), choices: Choices }).strict().nullable(),
        background: z.object({ id: z.string(), choices: Choices }).strict().nullable(),
        languages: z.array(z.string()),
        levels: z.array(LevelRecordSchema),
      })
      .strict(),
    play: z
      .object({
        hp: int,
        tempHp: nonNegInt,
        wounds: nonNegInt,
        hitDiceSpent: nonNegInt,
        resources: z.record(z.string(), z.object({ current: int, faces: z.array(int).optional() }).strict()),
        conditions: z.array(z.object({ id: z.string(), note: z.string().optional() }).strict()),
        inventory: z.array(
          z
            .object({
              itemId: z.string().nullable(),
              name: z.string(),
              qty: nonNegInt,
              equipped: z.boolean(),
              notes: z.string(),
            })
            .strict(),
        ),
        gold: z.number().nonnegative(),
        notes: z.string(),
        /** Choices remade at each Safe Rest (e.g. Seasoned Journeyman). */
        restChoices: z.record(z.string(), z.string()),
        /** Combat tracking (Core p.12–15). */
        combat: z
          .object({
            active: z.boolean(),
            round: nonNegInt,
            /** Actions left this turn (may exceed 3 via abilities). */
            actions: nonNegInt,
            /** Attacks made this turn, per creature ("hero", "companion"), for Rushed Attacks. */
            attacks: z.record(z.string(), nonNegInt),
            /** Reactions used since the end of your last turn (each is 1/round). */
            reactionsUsed: z.array(z.string()),
          })
          .strict(),
        /** Uses spent of limited abilities, keyed by ability id. */
        uses: z.record(z.string(), nonNegInt),
        /** On/off state (e.g. companion summoned). */
        flags: z.record(z.string(), z.boolean()),
      })
      .strict(),
    overrides: z.record(z.string(), z.union([z.number(), z.string()])),
    settings: z.object({ deflect: z.boolean() }).strict(),
  })
  .strict();

export type Character = z.infer<typeof CharacterSchema>;
export type LevelRecord = z.infer<typeof LevelRecordSchema>;

/** A new, empty character. `id` and `now` come from the caller (keeps this pure). */
export function newCharacter(id: string, name: string, now: string): Character {
  return {
    id,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    name,
    content: {},
    build: { stats: null, ancestry: null, background: null, languages: [], levels: [] },
    play: {
      hp: 0,
      tempHp: 0,
      wounds: 0,
      hitDiceSpent: 0,
      resources: {},
      conditions: [],
      inventory: [],
      gold: 0,
      notes: "",
      restChoices: {},
      combat: { active: false, round: 0, actions: 3, attacks: {}, reactionsUsed: [] },
      uses: {},
      flags: {},
    },
    overrides: {},
    settings: { deflect: true },
  };
}

/** Applies a change and bumps the revision. Never mutates the input. */
export function edit(character: Character, now: string, change: (draft: Character) => void): Character {
  const draft = structuredClone(character);
  change(draft);
  draft.revision = character.revision + 1;
  draft.updatedAt = now;
  return draft;
}

export const characterLevel = (c: Character): number => Math.max(1, c.build.levels.length);
