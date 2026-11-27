// Save-format migrations. Each step turns version N data into version N+1.
// Rules: steps are pure, never edit their input, and every old version keeps
// fixture files in tests/fixtures/saves/vN/ forever (tests load them all).
import { CharacterSchema, type Character } from "./character";

export const CURRENT_SCHEMA_VERSION = 2;

type Step = (data: unknown) => unknown;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** MIGRATIONS[n] upgrades version n to n+1. */
export const MIGRATIONS: Record<number, Step> = {
  // v1 → v2 (Phase 3): level skill records become per-skill point maps; play gains combat, uses, flags.
  1: (data) => {
    const c = obj(data);
    const build = obj(c["build"]);
    const levels = Array.isArray(build["levels"]) ? build["levels"] : [];
    const play = obj(c["play"]);
    return {
      ...c,
      build: {
        ...build,
        levels: levels.map((raw) => {
          const { skill, ...rest } = obj(raw);
          const s = obj(skill);
          const points: Record<string, number> = {};
          const bump = (id: unknown, n: number) => {
            if (typeof id === "string") points[id] = (points[id] ?? 0) + n;
          };
          bump(s["add"], 1);
          const move = obj(s["move"]);
          bump(move["from"], -1);
          bump(move["to"], 1);
          return { ...rest, skillPoints: points };
        }),
      },
      play: {
        ...play,
        combat: { active: false, round: 0, actions: 3, attacks: {}, reactionsUsed: [] },
        uses: {},
        flags: {},
      },
    };
  },
};

export type MigrationResult =
  | { ok: true; character: Character; migratedFrom: number | null }
  | { ok: false; error: string };

export function migrateCharacter(data: unknown, fromVersion: number): MigrationResult {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    return { ok: false, error: `Unknown save format version: ${String(fromVersion)}.` };
  }
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `This file was made by a newer version of Nimble Bear (format ${fromVersion}). Reload the extension to update, then try again.`,
    };
  }
  let current: unknown = structuredClone(data);
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, error: `Missing migration from format ${v} to ${v + 1}.` };
    try {
      current = step(current);
    } catch (e) {
      return { ok: false, error: `Upgrading from format ${v} failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const parsed = CharacterSchema.safeParse(current);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? issue.path.join(".") : "character";
    return { ok: false, error: `The character data isn't valid (${where}: ${issue?.message ?? "unknown problem"}).` };
  }
  return { ok: true, character: parsed.data, migratedFrom: fromVersion === CURRENT_SCHEMA_VERSION ? null : fromVersion };
}
