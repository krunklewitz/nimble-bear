// Which features give a direct combat benefit, for the Combat tab's "Class Abilities".
// A feature counts when it changes rolls (roll options), grants an action, has a combat
// resource or trigger, changes a combat number, or (if it's text only) its rules text is
// about combat. Spell access, stat increases and "gain your subclass feature" lines don't.
//
// Features that change another ability (FeatureDef.modifies, e.g. Soul Reaper changes the
// Lifebinding Spirit cantrip and its Harm attack) are shown with that ability instead.
import type { Effect } from "../data/schema";
import type { ActiveFeature, Sheet, SheetAction, SheetResource } from "./derive";
import { isAttack, REACTIONS, type Reaction } from "./play";

export interface CombatFeature {
  feature: ActiveFeature;
  /** Non-attack actions it grants (attacks are listed under Attacks). */
  actions: SheetAction[];
  /** Attacks it grants (shown under Attacks; referenced here for context). */
  attacks: SheetAction[];
  options: Sheet["rollOptions"];
  resources: SheetResource[];
  /** One-line summary of how the sheet uses it. */
  how: string[];
}

const COMBAT_TEXT = /\b(attacks?|attacking|damage|crits?|Initiative|Defend(ing)?|Interpose|actions?|reactions?|encounters?|combat|round|turn|Dying|Wounds?|Defense|advantage|disadvantage|Reach|Range|Momentum|Burst)\b/i;
const COMBAT_TARGETS = /^(defense|initiative|speed|damage\.|var\.|maxWounds|saveDc)/;
const NOT_COMBAT_TEXT = /^Gain your .* subclass feature\.?$|^You may now cast/i;

/** The id a feature's `modifies` uses for a basic reaction, e.g. "reaction.opportunity-attack". */
export function reactionId(name: Reaction): string {
  return "reaction." + name.toLowerCase().replace(/ /g, "-");
}

function isCombatEffect(e: Effect, sheet: Sheet): boolean {
  switch (e.type) {
    case "rollOption":
    case "grant":
    case "hook":
    case "resourceChange":
      return true;
    case "resource":
      return e.resource.id !== sheet.mana?.def.id;
    case "modifier":
      return COMBAT_TARGETS.test(e.target);
    case "setVar":
      return true;
    default:
      return false;
  }
}

const activeFeatures = (sheet: Sheet) => sheet.features.filter((f) => !f.replacedBy);

/**
 * The hero's features that change the ability with this id (a feature, spell, action,
 * `attack.<weapon id>` or `reaction.<name>`), followed by features that change those, in
 * the order gained.
 */
export function upgradesFor(sheet: Sheet, id: string): ActiveFeature[] {
  const out: ActiveFeature[] = [];
  const seen = new Set<string>([id]);
  const visit = (target: string) => {
    for (const f of activeFeatures(sheet)) {
      if (seen.has(f.def.id) || !f.def.modifies?.includes(target)) continue;
      seen.add(f.def.id);
      out.push(f);
      visit(f.def.id);
    }
  };
  visit(id);
  return out;
}

export function combatFeatures(sheet: Sheet): CombatFeature[] {
  const out: CombatFeature[] = [];
  for (const f of activeFeatures(sheet)) {
    const effects = f.def.effects;
    const textOnly = effects.every((e) => e.type === "text");
    const combat = effects.some((e) => isCombatEffect(e, sheet)) || (textOnly && COMBAT_TEXT.test(f.def.text) && !NOT_COMBAT_TEXT.test(f.def.text.trim()));
    if (!combat) continue;
    const granted = sheet.actions.filter((a) => a.sourceId === f.def.id);
    const options = sheet.rollOptions.filter((o) => o.sourceId === f.def.id);
    const resourceIds = new Set(effects.flatMap((e) => (e.type === "resource" ? [e.resource.id] : [])));
    const resources = sheet.resources.filter((r) => resourceIds.has(r.def.id));
    const how: string[] = [];
    for (const o of options) {
      const situation = typeof o.when === "object" ? o.when.situation : "";
      if (o.change === "addDice" && /\bcrit/i.test(situation)) how.push(`${o.label}: added automatically when you crit`);
      else if (o.mode === "auto" && !o.when) how.push(`${o.label}: applied automatically`);
      else if (["advantage", "disadvantage", "addDice", "add", "floor", "setPrimary"].includes(o.change)) how.push(`${o.label}: switch on in the roll window${situation ? ` (${situation})` : ""}`);
      else how.push(`${o.label}: apply by hand`);
    }
    if (f.def.automation === "manual" && how.length === 0) how.push("Apply by hand");
    out.push({ feature: f, actions: granted.filter((a) => !isAttack(a)), attacks: granted.filter((a) => isAttack(a)), options, resources, how });
  }

  // A feature that only changes another ability moves under that ability when the Combat tab shows it.
  // Features with their own buttons or trackers (granted actions, resources) stay listed.
  const ownIds = new Set(out.map((x) => x.feature.def.id));
  const shown = new Set<string>([...sheet.actions.map((a) => a.id), ...sheet.spells.known.map((s) => s.def.id), ...REACTIONS.map(reactionId)]);
  const byId = new Map(activeFeatures(sheet).map((f) => [f.def.id, f]));
  // Shown on the tab: listed itself (a combat feature, action, spell or reaction), or moved under something shown.
  const isShown = (id: string, path: Set<string>): boolean => {
    if (shown.has(id) || ownIds.has(id)) return true;
    const f = byId.get(id);
    return f !== undefined && !path.has(id) && movesUnder(f, new Set([...path, id]));
  };
  const movesUnder = (f: ActiveFeature, path: Set<string>): boolean => {
    const x = out.find((c) => c.feature.def.id === f.def.id);
    if (x && (x.actions.length > 0 || x.resources.length > 0)) return false;
    return (f.def.modifies ?? []).some((t) => isShown(t, path));
  };
  return out.filter((x) => !movesUnder(x.feature, new Set([x.feature.def.id])));
}
