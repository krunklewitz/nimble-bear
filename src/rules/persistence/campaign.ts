// The GM's campaign data, schema version 1 (DESIGN.md §5.3 item 7, §7): monsters the GM
// entered or loaded from their own file, encounters, and the combat tracker. It lives only on
// the GM's device and in the GM's campaign file; no monster data ships with the public site.
//
// Monster stat blocks follow the GMG format (NimbleGMG3.0.pdf PDF 3, printed 4–5): level
// (fractions like 1/2), size, [hp], [ar] M or H, [mv] Speed, [sv] saves, then abilities.
// Minions have no HP (any damage kills them). Legendary monsters (GMG PDF 20–21, printed 38–41)
// print HP per hero, plus Bloodied and Last Stand abilities.
//
// Fields added since the first campaign files (group, type, legendary, hpPerHero,
// lastStandHpPerHero; combatant legendary/lastStandHp/lastStand) are all optional, so every
// earlier v1 file still reads the same: no schema version bump was needed.
import { z } from "zod";
import { checksumOf, type Hasher } from "./canonical";

export const CAMPAIGN_SCHEMA_VERSION = 1;
export const CAMPAIGN_FILE_FORMAT = "nimble-bear/campaign";
/** A list of monsters on its own (the GM's private monster file). */
export const MONSTER_FILE_FORMAT = "nimble-bear/monsters";

const int = z.number().int();
const nonNegInt = int.nonnegative();

export const ArmorSchema = z.enum(["none", "medium", "heavy"]);
export type Armor = z.infer<typeof ArmorSchema>;

export const MonsterSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    /** As printed: "4", "1/2". */
    level: z.string().regex(/^\d+(\/\d+)?$/, "a level like 4 or 1/2"),
    minion: z.boolean(),
    size: z.string().max(20).optional(),
    /** Not used for minions. */
    hp: nonNegInt.optional(),
    armor: ArmorSchema,
    /** e.g. "6", "8, Fly 10". Default 6 when blank (GMG p.4). */
    speed: z.string().max(40).optional(),
    saves: z.string().max(40).optional(),
    abilities: z.array(z.object({ name: z.string().max(80), text: z.string().max(2000) }).strict()).max(40),
    notes: z.string().max(4000).optional(),
    /** Where the GM got it, e.g. "GMG p.28". */
    source: z.string().max(120).optional(),
    /** The family it's listed under in the book, e.g. "Kobolds". */
    group: z.string().max(80).optional(),
    /** What it is, from the banner: "Dumb Ogre", "undead". */
    type: z.string().max(60).optional(),
    /**
     * Legendary (GMG p.20–21) or Solo (Monsters & More) monsters fight a whole party alone: they
     * act after each hero's turn and have Bloodied and Last Stand abilities.
     */
    legendary: z.enum(["Legendary", "Solo"]).optional(),
    /** Legendary HP is printed per hero ("[hp]28/hero"); multiplied by the heroes in the fight. */
    hpPerHero: nonNegInt.optional(),
    /** HP regained per hero at the Last Stand ("regains [hp]7/hero"). */
    lastStandHpPerHero: nonNegInt.optional(),
  })
  .strict();
export type Monster = z.infer<typeof MonsterSchema>;

export const EncounterSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    heroLevels: z.array(int.min(1).max(20)).max(12),
    monsters: z.array(z.object({ monsterId: z.string().min(1), count: int.min(1).max(99) }).strict()).max(40),
    notes: z.string().max(4000).optional(),
  })
  .strict();
export type Encounter = z.infer<typeof EncounterSchema>;

export const CombatantSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["hero", "monster"]),
    name: z.string().trim().min(1).max(80),
    monsterId: z.string().optional(),
    hp: int.optional(),
    hpMax: nonNegInt.optional(),
    armor: ArmorSchema,
    minion: z.boolean(),
    /** Took its turn this round. */
    done: z.boolean(),
    defeated: z.boolean(),
    conditions: z.array(z.string()).max(30),
    /** Owlbear token this combatant is linked to (Phase 5 token links). */
    tokenId: z.string().optional(),
    /** A Legendary or Solo monster: shows Bloodied at half HP. */
    legendary: z.boolean().optional(),
    /** HP it regains at its Last Stand (Legendary monsters, per hero × heroes). */
    lastStandHp: nonNegInt.optional(),
    /** Its Last Stand has started. */
    lastStand: z.boolean().optional(),
  })
  .strict();
export type Combatant = z.infer<typeof CombatantSchema>;

export const TrackerSchema = z
  .object({
    active: z.boolean(),
    round: nonNegInt,
    encounterId: z.string().optional(),
    combatants: z.array(CombatantSchema).max(100),
  })
  .strict();
export type Tracker = z.infer<typeof TrackerSchema>;

export const CampaignSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    revision: nonNegInt,
    updatedAt: z.string(),
    monsters: z.array(MonsterSchema).max(2000),
    encounters: z.array(EncounterSchema).max(500),
    tracker: TrackerSchema,
  })
  .strict();
export type Campaign = z.infer<typeof CampaignSchema>;

export function newCampaign(id: string, now: string): Campaign {
  return { id, name: "My campaign", revision: 0, updatedAt: now, monsters: [], encounters: [], tracker: { active: false, round: 0, combatants: [] } };
}

export interface CampaignFile {
  format: typeof CAMPAIGN_FILE_FORMAT;
  schemaVersion: number;
  appVersion: string;
  savedAt: string;
  checksum: string;
  campaign: Campaign;
}

export async function buildCampaignFile(campaign: Campaign, appVersion: string, savedAt: string, hash: Hasher): Promise<{ text: string; checksum: string }> {
  const checksum = await checksumOf(campaign, hash);
  const file: CampaignFile = { format: CAMPAIGN_FILE_FORMAT, schemaVersion: CAMPAIGN_SCHEMA_VERSION, appVersion, savedAt, checksum, campaign };
  return { text: `${JSON.stringify(file, null, 2)}\n`, checksum };
}

export type ParsedCampaignFile =
  | { ok: true; kind: "campaign"; campaign: Campaign; checksum: string; checksumMatches: boolean; savedAt: string | null }
  | { ok: true; kind: "monsters"; monsters: Monster[]; skipped: { name: string; reason: string }[] }
  | { ok: false; error: string };

const issues = (e: z.ZodError) =>
  e.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "file"}: ${i.message}`)
    .join("; ");

/** Reads a campaign file or a monster file. Nothing is changed when it fails. */
export async function parseCampaignFile(text: string, hash: Hasher): Promise<ParsedCampaignFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This isn't a Nimble Bear campaign or monster file (it isn't valid JSON)." };
  }
  if (raw === null || typeof raw !== "object") return { ok: false, error: "This isn't a Nimble Bear campaign or monster file." };
  const env = raw as Record<string, unknown>;
  if (env["format"] === MONSTER_FILE_FORMAT) {
    // Monster by monster: one bad entry (e.g. a hand edit) shouldn't stop the rest loading.
    const list = env["monsters"];
    if (!Array.isArray(list)) return { ok: false, error: "Monster file problem: it has no list of monsters." };
    const monsters: Monster[] = [];
    const skipped: { name: string; reason: string }[] = [];
    for (const item of list) {
      const m = MonsterSchema.safeParse(item);
      if (m.success) monsters.push(m.data);
      else {
        const name = item !== null && typeof item === "object" && typeof (item as Record<string, unknown>)["name"] === "string" ? String((item as Record<string, unknown>)["name"]) : "(no name)";
        skipped.push({ name, reason: issues(m.error) });
      }
    }
    if (!monsters.length && skipped.length) return { ok: false, error: `Monster file problem: none of its monsters could be read (${skipped[0]?.reason ?? ""}).` };
    return { ok: true, kind: "monsters", monsters, skipped };
  }
  if (env["format"] !== CAMPAIGN_FILE_FORMAT) return { ok: false, error: "This isn't a Nimble Bear campaign or monster file (wrong format marker)." };
  if (env["schemaVersion"] !== CAMPAIGN_SCHEMA_VERSION) return { ok: false, error: `This campaign file is format ${String(env["schemaVersion"])}; this version of Nimble Bear reads format ${CAMPAIGN_SCHEMA_VERSION}.` };
  const parsed = CampaignSchema.safeParse(env["campaign"]);
  if (!parsed.success) return { ok: false, error: `Campaign file problem: ${issues(parsed.error)}` };
  const checksum = await checksumOf(parsed.data, hash);
  return { ok: true, kind: "campaign", campaign: parsed.data, checksum, checksumMatches: env["checksum"] === checksum, savedAt: typeof env["savedAt"] === "string" ? env["savedAt"] : null };
}

export function campaignFileName(campaign: Campaign, date: string): string {
  const safe = campaign.name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return `${safe || "Campaign"}_${date}.nimble-campaign.json`;
}
