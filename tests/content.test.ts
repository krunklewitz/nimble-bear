// Validates every content file in src/data/content against the schema, and checks
// cross-references (feature ids, starting gear, unique ids). Extraction agents run this.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  AncestryDef,
  ArmorDef,
  BackgroundDef,
  ClassDef,
  ConditionDef,
  EquipmentRuleDef,
  CoreRulesDef,
  GearDef,
  ShieldDef,
  SpellDef,
  SubclassDef,
  WeaponDef,
  type Effect,
} from "../src/data/schema";

const root = join(__dirname, "..", "src", "data", "content");

function schemaFor(rel: string): z.ZodType | null {
  const p = rel.replace(/\\/g, "/");
  if (p === "core/rules.json") return CoreRulesDef;
  if (p === "core/conditions.json") return ConditionDef.array();
  if (p === "core/ancestries.json") return AncestryDef.array();
  if (p === "core/backgrounds.json") return BackgroundDef.array();
  if (p === "core/armor.json") return ArmorDef.array();
  if (p === "core/shields.json") return ShieldDef.array();
  if (p === "core/weapons.json") return WeaponDef.array();
  if (p === "core/gear.json") return GearDef.array();
  if (p === "core/equipment-rules.json") return EquipmentRuleDef.array();
  if (/^spells\/[a-z-]+\.json$/.test(p)) return SpellDef.array();
  if (/^classes\/[a-z-]+-subclasses\.json$/.test(p)) return SubclassDef.array();
  if (/^classes\/[a-z-]+\.json$/.test(p)) return ClassDef;
  return null;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith(".json") ? [join(dir, d.name)] : []));
}

const files = walk(root).map((f) => ({ path: f, rel: relative(root, f).replace(/\\/g, "/") }));
const parsed = new Map<string, unknown>();

describe("content files", () => {
  it("exist", () => expect(files.length).toBeGreaterThan(0));

  for (const f of files) {
    it(`${f.rel} matches the schema`, () => {
      const schema = schemaFor(f.rel);
      expect(schema, `no schema mapped for ${f.rel}`).not.toBeNull();
      const data = JSON.parse(readFileSync(f.path, "utf8")) as unknown;
      if (!schema) return;
      const result = schema.safeParse(data);
      if (!result.success) {
        const msgs = result.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`);
        throw new Error(`${f.rel}\n${msgs.join("\n")}`);
      }
      parsed.set(f.rel, result.data);
    });
  }
});

interface Feature { id: string; effects: Effect[] }
type WithFeatures = { features: Feature[]; optionPools?: Record<string, Feature[]> | undefined; levels: Record<string, string[]> };

function nestedEffects(effects: Effect[]): Effect[] {
  return effects.flatMap((e) => (e.type === "choice" && e.choice.from.kind === "options" ? [e, ...e.choice.from.options.flatMap((o) => nestedEffects(o.effects ?? []))] : [e]));
}

describe("content cross-references", () => {
  const load = (rel: string) => (existsSync(join(root, rel)) ? (JSON.parse(readFileSync(join(root, rel), "utf8")) as unknown) : undefined);

  it("uses unique ids across all entries and features", () => {
    const seen = new Map<string, string>();
    const add = (id: string, where: string) => {
      expect(seen.has(id), `duplicate id ${id} in ${where} (first in ${seen.get(id)})`).toBe(false);
      seen.set(id, where);
    };
    for (const f of files) {
      if (f.rel === "core/rules.json") continue;
      const data = load(f.rel);
      const list = (Array.isArray(data) ? data : [data]) as { id: string; features?: Feature[]; optionPools?: Record<string, Feature[]> }[];
      for (const entry of list) {
        add(entry.id, f.rel);
        for (const feat of entry.features ?? []) add(feat.id, `${f.rel} (${entry.id})`);
        for (const pool of Object.values(entry.optionPools ?? {})) for (const feat of pool) add(feat.id, `${f.rel} (${entry.id} pool)`);
      }
    }
  });

  it("references only features, items and spells that exist", () => {
    const itemIds = new Set<string>();
    for (const rel of ["core/armor.json", "core/shields.json", "core/weapons.json", "core/gear.json"]) {
      for (const it of (load(rel) as { id: string }[] | undefined) ?? []) itemIds.add(it.id);
    }
    const spellIds = new Set<string>();
    for (const f of files.filter((x) => x.rel.startsWith("spells/"))) for (const s of load(f.rel) as { id: string }[]) spellIds.add(s.id);

    for (const f of files.filter((x) => x.rel.startsWith("classes/"))) {
      const data = load(f.rel);
      const entries = (Array.isArray(data) ? data : [data]) as (WithFeatures & { id: string; startingGear?: { id: string }[] })[];
      const classFile = f.rel.endsWith("-subclasses.json") ? (load(f.rel.replace("-subclasses", "")) as WithFeatures | undefined) : undefined;
      for (const entry of entries) {
        const own = new Set([...entry.features.map((x) => x.id), ...Object.values(entry.optionPools ?? {}).flat().map((x) => x.id)]);
        const all = new Set([...own, ...(classFile?.features.map((x) => x.id) ?? [])]);
        for (const [lvl, ids] of Object.entries(entry.levels)) for (const id of ids) expect(own.has(id), `${f.rel}: level ${lvl} lists unknown feature ${id}`).toBe(true);
        for (const g of entry.startingGear ?? []) expect(itemIds.has(g.id), `${f.rel}: starting gear ${g.id} not in equipment data`).toBe(true);
        const pools = new Set([...Object.keys(entry.optionPools ?? {}), ...Object.keys(classFile?.optionPools ?? {})]);
        for (const feat of [...entry.features, ...Object.values(entry.optionPools ?? {}).flat()]) {
          for (const e of nestedEffects(feat.effects)) {
            if (e.type === "replace") for (const id of e.features) expect(all.has(id), `${feat.id}: replaces unknown ${id}`).toBe(true);
            if (e.type === "choice" && e.choice.from.kind === "pool") expect(pools.has(e.choice.from.pool), `${feat.id}: unknown pool ${e.choice.from.pool}`).toBe(true);
            if (e.type === "spells") for (const id of e.extra ?? []) expect(spellIds.has(id), `${feat.id}: unknown spell ${id}`).toBe(true);
          }
        }
      }
    }
  });

  it("puts each spell in the file for its school", () => {
    for (const f of files.filter((x) => x.rel.startsWith("spells/"))) {
      // Utility spells live in their school file with tier "utility".
      const school = f.rel.replace(/^spells\/|\.json$/g, "");
      for (const s of load(f.rel) as { id: string; school: string }[]) expect(s.school, `${s.id} in ${f.rel}`).toBe(school);
    }
  });
});
