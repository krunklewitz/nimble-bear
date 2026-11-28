import { useState } from "react";
import { getContent } from "../../data/content";
import type { SheetAction } from "../../rules/derive";
import { diceText, toDice } from "../../rules/formula";
import { combatFeatures, type CombatFeature } from "../../rules/combat";
import { checkReaction, endCombat, endTurn, isAttack, isOffTurn, REACTIONS, reactionCost, startTurn, spendReaction, type Reaction } from "../../rules/play";
import { SourceTag, signed } from "../common";
import type { RollTarget } from "../RollDialog";
import type { TabProps } from "./shared";

const REACTION_TEXT: Record<Reaction, string> = {
  Defend: "Reduce incoming damage from a single attack by your Defense. Crits ignore Defense.",
  Interpose: "If a creature within Reach 2 would be hit with an attack, enter their space and become the new target.",
  "Opportunity Attack": "A melee attack with disadvantage against an adjacent creature as it willingly moves away.",
  Help: "Allow an ally to reroll if you can reasonably explain how you could help them.",
};

/** Known spells grouped as Cantrips, Tier 1, Tier 2, … and Utility spells (in that order). */
export function spellGroups<T extends { def: { tier: number | "utility" } }>(spells: T[]): { key: string; label: string; cost: number; spells: T[] }[] {
  const tiers = [...new Set(spells.map((s) => s.def.tier).filter((t): t is number => typeof t === "number" && t > 0))].sort((a, b) => a - b);
  const groups = [
    { key: "cantrip", label: "Cantrips", cost: 0, spells: spells.filter((s) => s.def.tier === 0) },
    ...tiers.map((t) => ({ key: `tier-${t}`, label: `Tier ${t}`, cost: t, spells: spells.filter((s) => s.def.tier === t) })),
    { key: "utility", label: "Utility spells", cost: 0, spells: spells.filter((s) => s.def.tier === "utility") },
  ];
  return groups.filter((g) => g.spells.length > 0);
}

export function rollTargetFor(a: SheetAction): RollTarget {
  return {
    kind: a.roll?.kind === "heal" ? "heal" : a.roll ? "attack" : "plain",
    label: a.name,
    action: a,
    group: a.kind === "weapon" ? (a.range && !a.range.includes("thrown") ? "ranged" : "melee") : undefined,
    creature: a.sourceId === "feature.shepherd.my-buddy" ? "companion" : "hero",
  };
}

/** Combat-relevant features: what each does, how the sheet handles it, and Use buttons for its actions. */
function AbilityRows({ items, onRoll }: { items: CombatFeature[]; onRoll: (t: RollTarget) => void }) {
  return (
    <ul className="rows">
      {items.map((x) => {
        const uses = [...x.actions, ...x.attacks].find((a) => a.limit)?.limit;
        const tag = x.how.some((h) => /automatically/.test(h)) ? "auto" : x.how.some((h) => /roll window/.test(h)) ? "toggle" : x.feature.def.automation === "manual" ? "by hand" : "";
        return (
          <li key={x.feature.def.id} className="row-item ability">
            <details>
              <summary>
                <span className="row-name">{x.feature.def.name}</span>
                <span className="row-meta">
                  {tag}
                  {uses ? " · " + Math.max(0, uses.max - uses.used) + "/" + uses.max : ""}
                  {x.resources.map((r) => " · " + r.def.name + " " + (r.max >= 99 ? String(r.current) : r.current + "/" + r.max)).join("")}
                </span>
              </summary>
              {x.how.length > 0 && (
                <ul className="small how">
                  {x.how.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
              <p className="small feature-text">{x.feature.def.text}</p>
              {x.feature.def.manualNote && <p className="small">✋ {x.feature.def.manualNote}</p>}
              {x.attacks.length > 0 && <p className="small">Its attacks are under Attacks: {x.attacks.map((a) => a.name).join(", ")}.</p>}
              <SourceTag source={x.feature.def.source} />
            </details>
            {x.actions.length > 0 && (
              <span className="ability-actions">
                {x.actions.map((a) => (
                  <button key={a.id} type="button" className="roll-btn" title={a.text} onClick={() => onRoll(rollTargetFor(a))}>
                    {x.actions.length > 1 ? a.name : a.roll ? "Roll" : "Use"}
                  </button>
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CombatTab({ sheet, character, update, onRoll }: TabProps) {
  const content = getContent();
  const combat = character.play.combat;
  const offTurn = isOffTurn(character);
  const [addCondition, setAddCondition] = useState("");
  const [upcast, setUpcast] = useState<Record<string, number>>({});
  const classAbilities = combatFeatures(sheet);
  const attacks = sheet.actions.filter((a) => a.kind !== "passive" && isAttack(a));

  const react = (name: Reaction) => {
    const problems = checkReaction(character, sheet, name);
    if (problems.length && !window.confirm(`${problems.join(" ")} Use it anyway?`)) return;
    update(name, (d) => spendReaction(d, sheet, name));
  };

  const spellAction = (id: string): SheetAction | null => {
    const s = sheet.spells.known.find((k) => k.def.id === id);
    if (!s) return null;
    const cost = s.cost + (upcast[id] ?? 0);
    let roll: SheetAction["roll"];
    if (s.def.roll) {
      try {
        roll = {
          kind: s.def.roll.kind,
          dice: toDice(s.def.roll.dice, sheet.scope),
          formula: s.def.roll.dice,
          damageType: s.def.roll.damageType,
          ignoresArmor: s.def.roll.ignoresArmor,
          canCrit: s.def.roll.kind === "damage" && !s.def.roll.noCrit,
          canMiss: s.def.roll.kind === "damage",
          vicious: false,
        };
      } catch {
        roll = undefined;
      }
    }
    return { id: s.def.id, name: s.def.name, kind: "spell", actions: s.def.actions, manaCost: cost, roll, text: s.def.text, sourceId: s.def.id };
  };

  return (
    <div>
      {/* Turn tracker */}
      <section className="card" aria-label="Combat">
        {combat.active ? (
          <>
            <div className="row space">
              <strong>
                Round {combat.round} · {offTurn ? "Others' turns" : "Your turn"}
              </strong>
              <span className="row">
                <span className="pips" aria-label={`${combat.actions} actions left`}>
                  {Array.from({ length: Math.max(3, combat.actions) }, (_, i) => (
                    <span key={i} className={`pip big ${i < combat.actions ? "on" : ""}`} />
                  ))}
                </span>
                <button type="button" className="mini" aria-label="Spend an action" onClick={() => update("Spend action", (d) => void (d.play.combat.actions = Math.max(0, d.play.combat.actions - 1)))}>
                  −
                </button>
                <button type="button" className="mini" aria-label="Gain an action" onClick={() => update("Gain action", (d) => void (d.play.combat.actions += 1))}>
                  +
                </button>
              </span>
            </div>
            <p className="small">
              {offTurn ? "Reactions spend the actions you'll start your next turn with. 1/turn abilities work again on other creatures' turns (Core Rules p.13)." : "Actions come back at the end of your turn."}
              {sheet.dying ? " Dying: max 1 action." : ""}
            </p>
            <div className="row">
              {offTurn ? (
                <button type="button" className="primary" onClick={() => update("Start my turn", (d) => startTurn(d, sheet))}>
                  Start my turn
                </button>
              ) : (
                <button type="button" className="primary" onClick={() => update("End turn", (d) => endTurn(d, sheet))}>
                  End turn
                </button>
              )}
              <button type="button" onClick={() => window.confirm("End combat?") && update("End combat", (d) => endCombat(d, sheet))}>
                End combat
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="primary wide" onClick={() => onRoll({ kind: "initiative", label: "Initiative", modifier: sheet.initiative.mod })}>
            Roll Initiative {signed(sheet.initiative.mod)} · starts combat
          </button>
        )}
      </section>

      {/* Class Abilities */}
      <details className="combat-section" open>
        <summary>
          <span>Class Abilities</span>
          <span className="row-meta">{classAbilities.length}</span>
        </summary>
        {classAbilities.length === 0 && <p className="small">No combat abilities yet.</p>}
        <AbilityRows items={classAbilities.filter((x) => x.feature.source !== "ancestry" && x.feature.source !== "background")} onRoll={onRoll} />
        {classAbilities.some((x) => x.feature.source === "ancestry" || x.feature.source === "background") && (
          <>
            <p className="small subhead">From ancestry &amp; background</p>
            <AbilityRows items={classAbilities.filter((x) => x.feature.source === "ancestry" || x.feature.source === "background")} onRoll={onRoll} />
          </>
        )}
      </details>

      {/* Attacks */}
      <details className="combat-section" open>
        <summary>
          <span>Attacks</span>
          <span className="row-meta">{attacks.length}</span>
        </summary>
      <ul className="rows">
        {attacks.map((a) => (
            <li key={a.id} className="row-item">
              <details>
                <summary>
                  <span className="row-name">{a.name}</span>
                  <span className="row-meta">
                    {a.roll ? diceText(a.roll.dice) : ""}
                    {a.actions !== undefined ? ` · ${a.actions}◆` : ""}
                    {a.limit ? ` · ${Math.max(0, a.limit.max - a.limit.used)}/${a.limit.max}` : ""}
                  </span>
                </summary>
                <p className="small">
                  {a.reach ? `Reach ${a.reach}. ` : ""}
                  {a.range ? `Range ${a.range}. ` : ""}
                  {a.text}
                </p>
              </details>
              <button type="button" className="roll-btn" onClick={() => onRoll(rollTargetFor(a))}>
                {a.roll ? "Roll" : "Use"}
              </button>
            </li>
          ))}
      </ul>
      </details>

      {/* Reactions */}
      <details className="combat-section" open>
        <summary>
          <span>Reactions</span>
          <span className="row-meta">{combat.reactionsUsed.length ? `${combat.reactionsUsed.length} used` : ""}</span>
        </summary>
      <p className="small">
        Each costs 1 action and is 1/round (Core Rules p.15). Defense {sheet.defense.value}
        {!sheet.defense.armorProficient ? " · Defend costs 2 actions in this armor" : ""}.
      </p>
      {sheet.defense.shield > 0 && character.settings.deflect && (
        <p className="small note">
          <strong>Deflect!</strong> Instead of adding your shield's +{sheet.defense.shield}, you may reduce one attack's damage by {sheet.defense.shield} for free, 1/round (Core Rules p.33).
        </p>
      )}
      <div className="reaction-grid">
        {REACTIONS.map((r) => {
          const used = combat.reactionsUsed.includes(r);
          return (
            <button key={r} type="button" className={`reaction ${used ? "used" : ""}`} title={REACTION_TEXT[r]} onClick={() => react(r)}>
              <strong>{r}</strong>
              <span className="small">{used ? "used this round" : `${reactionCost(sheet, r)}◆`}</span>
            </button>
          );
        })}
      </div>
      </details>

      {/* Spells */}
      {sheet.spells.known.length > 0 && (
        <details className="combat-section" open>
          <summary>
            <span>Spells</span>
            <span className="row-meta">{sheet.spells.known.length}</span>
          </summary>
          <p className="small">
            {sheet.mana ? `Mana ${sheet.mana.current}/${sheet.mana.max} · ` : ""}Highest tier {Math.max(0, sheet.spells.maxTier)} · {sheet.spells.schools.join(", ")}
          </p>
          {spellGroups(sheet.spells.known).map((g) => (
            <details key={g.key} className="spell-group" open={g.key === "cantrip"}>
              <summary>
                <span>{g.label}</span>
                <span className="row-meta">
                  {g.spells.length} spell{g.spells.length === 1 ? "" : "s"}
                  {g.cost ? ` · ${g.cost} mana` : ""}
                </span>
              </summary>
          <ul className="rows">
            {g.spells.map((s) => {
              const tierNum = typeof s.def.tier === "number" ? s.def.tier : 0;
              const action = spellAction(s.def.id);
              if (!action) return null;
              const extra = upcast[s.def.id] ?? 0;
              return (
                <li key={s.def.id} className="row-item">
                  <details>
                    <summary>
                      <span className="row-name">{s.def.name}</span>
                      <span className="row-meta">
                        {s.def.tier === 0 ? "cantrip" : s.def.tier === "utility" ? "utility" : `T${s.def.tier} · ${s.cost + extra} mana`}
                        {s.def.actions !== undefined ? ` · ${s.def.actions}◆` : ` · ${s.def.castingTime ?? ""}`}
                      </span>
                    </summary>
                    {s.def.restriction && <p className="small"><em>{s.def.restriction}</em></p>}
                    <p className="small">{s.def.text}</p>
                    {s.def.upcast && <p className="small"><strong>Upcast:</strong> {s.def.upcast}</p>}
                    {s.def.highLevels && <p className="small"><strong>High Levels:</strong> {s.def.highLevels}</p>}
                    {tierNum > 0 && s.def.upcast && sheet.spells.maxTier > tierNum && (
                      <label className="small">
                        Upcast with +
                        <input
                          type="number"
                          className="small-input"
                          min={0}
                          max={sheet.spells.maxTier - tierNum}
                          value={extra}
                          onChange={(e) => setUpcast({ ...upcast, [s.def.id]: Math.max(0, Math.min(sheet.spells.maxTier - tierNum, Number(e.target.value) || 0)) })}
                        />{" "}
                        mana
                      </label>
                    )}
                    <SourceTag source={s.def.source} />
                  </details>
                  <button type="button" className="roll-btn" onClick={() => onRoll({ ...rollTargetFor(action), manaCost: action.manaCost })}>
                    Cast
                  </button>
                </li>
              );
            })}
          </ul>
            </details>
          ))}
        </details>
      )}

      {/* Conditions and situations */}
      <details className="combat-section" open>
        <summary>
          <span>Conditions</span>
          <span className="row-meta">{character.play.conditions.length || ""}</span>
        </summary>
      <div className="chips">
        {character.play.conditions.length === 0 && <span className="small">None</span>}
        {character.play.conditions.map((c, i) => {
          const def = content.conditions.get(c.id);
          return (
            <span key={`${c.id}-${i}`} className="chip" title={def?.text}>
              {def?.name ?? c.id}
              <button type="button" aria-label={`Remove ${def?.name ?? c.id}`} onClick={() => update(`Remove ${def?.name ?? c.id}`, (d) => void d.play.conditions.splice(i, 1))}>
                ×
              </button>
            </span>
          );
        })}
      </div>
      <div className="row">
        <select value={addCondition} onChange={(e) => setAddCondition(e.target.value)} aria-label="Add a condition">
          <option value="">Add a condition…</option>
          {[...content.conditions.values()].map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!addCondition}
          onClick={() => {
            const def = content.conditions.get(addCondition);
            update(`Add ${def?.name ?? addCondition}`, (d) => void d.play.conditions.push({ id: addCondition }));
            setAddCondition("");
          }}
        >
          Add
        </button>
      </div>
      {character.play.conditions.length > 0 && (
        <ul className="small">
          {character.play.conditions.map((c, i) => {
            const def = content.conditions.get(c.id);
            return def ? (
              <li key={`t-${c.id}-${i}`}>
                <strong>{def.name}.</strong> {def.text}
              </li>
            ) : null;
          })}
        </ul>
      )}
      {sheet.toggles.length > 0 && (
        <>
          <p className="small subhead">Situations</p>
          {sheet.toggles.map((t) => (
            <label key={t.id} className="option compact">
              <input type="checkbox" checked={t.on} onChange={() => update(`${t.on ? "Clear" : "Set"}: ${t.label}`, (d) => void (d.play.flags[t.id] = !t.on))} />
              <span>{t.label}</span>
            </label>
          ))}
        </>
      )}
      {sheet.hooks.length > 0 && (
        <p className="small note">
          {sheet.hooks.map((h) => `${h.on === "woundGained" ? "When you gain a Wound: " : ""}${h.text}`).join(" ")}
        </p>
      )}
      </details>
    </div>
  );
}
