// What an item is and which book rules apply to it, for the Gear tab.
// Facts come from the equipment tables; rule text from core/equipment-rules.json (verbatim).
import type { Content } from "../data/content";
import type { EquipmentRuleDefT, SourceRefT } from "../data/schema";
import type { Sheet } from "./derive";

export interface ItemInfo {
  id: string;
  name: string;
  kind: "weapon" | "armor" | "shield" | "gear" | "custom";
  /** One-line summary, e.g. "1d6+STR bludgeoning · 2 gp". */
  summary: string;
  /** Plain facts: what it does for this hero. */
  facts: string[];
  /** Book rules that apply to this item. */
  rules: EquipmentRuleDefT[];
  source: SourceRefT | undefined;
  /** Shown as a warning (e.g. not proficient, STR requirement not met). */
  warnings: string[];
}

function applies(rule: EquipmentRuleDefT, kind: ItemInfo["kind"], id: string, props: Record<string, unknown>, group?: string, category?: string): boolean {
  const a = rule.appliesTo;
  switch (a.kind) {
    case "item":
      return a.id === id;
    case "allArmor":
      return kind === "armor";
    case "allShields":
      return kind === "shield";
    case "allWeapons":
      return kind === "weapon";
    case "meleeWeapons":
      return kind === "weapon" && group === "melee";
    case "rangedWeapons":
      return kind === "weapon" && group === "ranged";
    case "allGear":
      return kind === "gear";
    case "armorCategory":
      return kind === "armor" && category === a.category;
    case "weaponProperty":
      return kind === "weapon" && props[a.property] !== undefined && props[a.property] !== false;
  }
}

export function itemInfo(content: Content, itemId: string | null, name: string, sheet?: Sheet): ItemInfo {
  const rulesFor = (kind: ItemInfo["kind"], id: string, props: Record<string, unknown> = {}, group?: string, category?: string) =>
    content.equipmentRules.filter((r) => applies(r, kind, id, props, group, category));
  const str = sheet?.stats.STR;
  const warnings: string[] = [];
  const strCheck = (req: number | undefined) => {
    if (req !== undefined && str !== undefined && str < req) warnings.push(`Requires ${req} STR; you have ${str >= 0 ? "+" : ""}${str} (RQ-017: the book doesn't say what happens).`);
  };

  const w = itemId ? content.weapons.get(itemId) : undefined;
  if (w) {
    const facts = [
      `Damage: ${w.damage.join(" or ")} ${w.damageType.join("/")}.`,
      `Properties: ${w.propertiesText || "none"}.`,
      w.properties.requiresStr !== undefined ? `Requires ${w.properties.requiresStr} STR.` : "",
      w.properties.oneHandedRequiresStr !== undefined ? `Can be used 1-handed with ${w.properties.oneHandedRequiresStr} STR.` : "",
    ].filter(Boolean);
    const action = sheet?.actions.find((a) => a.id === `attack.${w.id}`);
    if (action?.roll) facts.push(`You roll ${action.roll.formula} (${action.roll.dice.flat >= 0 ? "+" : ""}${action.roll.dice.flat}).${action.roll.canCrit ? "" : " You aren't proficient: it can't crit."}`);
    strCheck(w.properties.requiresStr);
    return { id: w.id, name: w.name, kind: "weapon", summary: `${w.damage[0]} ${w.damageType.join("/")}${w.cost ? ` · ${w.cost}` : ""}`, facts, rules: rulesFor("weapon", w.id, w.properties, w.group), source: w.source, warnings };
  }

  const a = itemId ? content.armor.get(itemId) : undefined;
  if (a) {
    const facts = [`${a.category[0]?.toUpperCase()}${a.category.slice(1)} armor. Defense ${a.defense.replace("min(DEX,2)", "DEX (max 2)")}.`, a.requiresStr !== undefined ? `Requires ${a.requiresStr} STR.` : ""].filter(Boolean);
    if (sheet?.cls) {
      const prof = sheet.cls.proficiency.armor.includes(a.category);
      facts.push(prof ? `${sheet.cls.name}s are proficient with ${a.category} armor.` : `${sheet.cls.name}s aren't proficient with ${a.category} armor: Defending costs 1 additional action.`);
      if (!prof) warnings.push(`Not proficient with ${a.category} armor.`);
    }
    strCheck(a.requiresStr);
    return { id: a.id, name: a.name, kind: "armor", summary: `Defense ${a.defense.replace("min(DEX,2)", "DEX (max 2)")} · ${a.cost}`, facts, rules: rulesFor("armor", a.id, {}, undefined, a.category), source: a.source, warnings };
  }

  const s = itemId ? content.shields.get(itemId) : undefined;
  if (s) {
    const facts = [`+${s.defense} Defense while equipped.`, s.requiresStr !== undefined ? `Requires ${s.requiresStr} STR.` : ""].filter(Boolean);
    if (sheet?.cls && !sheet.cls.proficiency.shields) warnings.push(`${sheet.cls.name}s aren't proficient with shields.`);
    strCheck(s.requiresStr);
    return { id: s.id, name: s.name, kind: "shield", summary: `+${s.defense} Defense · ${s.cost}`, facts, rules: rulesFor("shield", s.id), source: s.source, warnings };
  }

  const g = itemId ? content.gear.get(itemId) : undefined;
  if (g) {
    return { id: g.id, name: g.name, kind: "gear", summary: g.cost ?? "", facts: g.text ? [g.text] : [], rules: rulesFor("gear", g.id), source: g.source, warnings };
  }

  return { id: itemId ?? name, name, kind: "custom", summary: "", facts: [], rules: [], source: undefined, warnings };
}
