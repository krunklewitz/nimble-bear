import { useState } from "react";
import { getContent } from "../../data/content";
import type { Combatant } from "../../rules/persistence/campaign";
import { addCombatant, addCondition, damageAfterArmor, damageCombatant, endEncounter, healCombatant, isBloodied, moveCombatant, nextRound, removeCombatant, removeCondition, setDefeated, startLastStand, toggleDone } from "../../rules/tracker";
import { useCampaign } from "./CampaignContext";
import { ARMOR_LABEL, MonsterDetails } from "./MonstersTab";

function CombatantRow({ c, first, last }: { c: Combatant; first: boolean; last: boolean }) {
  const book = useCampaign();
  const monster = c.monsterId ? book.get().monsters.find((m) => m.id === c.monsterId) : undefined;
  const [amount, setAmount] = useState("");
  const [crit, setCrit] = useState(false);
  const [condition, setCondition] = useState("");
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const act = (label: string, fn: Parameters<typeof book.update>[1]) => void book.update(`${label}: ${c.name}`, fn);
  const conditions = getContent().conditions;

  return (
    <li className={`row-item combatant ${c.defeated ? "defeated" : ""} ${c.done ? "done" : ""}`}>
      <input type="checkbox" aria-label={`${c.name} has acted this round`} checked={c.done} onChange={() => act("Turn", (d) => toggleDone(d, c.id))} />
      <details>
        <summary>
          <span className="row-name">
            {c.name}
            {c.defeated ? " ✝" : ""}
          </span>
          <span className="row-meta">
            {[c.kind === "hero" ? "hero" : c.minion ? "minion" : c.hp !== undefined ? `${c.hp}/${c.hpMax ?? c.hp} HP` : "", c.lastStand ? "LAST STAND" : isBloodied(c) ? "BLOODIED" : "", ARMOR_LABEL[c.armor], c.conditions.join(", ")].filter(Boolean).join(" · ")}
          </span>
        </summary>
        {c.kind === "monster" && (
          <>
            <div className="row">
              <input className="small-input" inputMode="numeric" aria-label={`Amount for ${c.name}`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              <label className="option compact">
                <input type="checkbox" checked={crit} onChange={(e) => setCrit(e.target.checked)} />
                <span>Crit</span>
              </label>
              <button
                type="button"
                disabled={n === 0}
                onClick={() => {
                  act(`Damage ${n}${crit ? " (crit)" : ""}`, (d) => void damageCombatant(d, c.id, n, crit));
                  setAmount("");
                  setCrit(false);
                }}
              >
                Damage
              </button>
              {!c.minion && c.hp !== undefined && (
                <button
                  type="button"
                  disabled={n === 0}
                  onClick={() => {
                    act(`Heal ${n}`, (d) => healCombatant(d, c.id, n));
                    setAmount("");
                  }}
                >
                  Heal
                </button>
              )}
            </div>
            {n > 0 && c.armor !== "none" && (
              <p className="small">
                {ARMOR_LABEL[c.armor]}: takes {damageAfterArmor(n, c.armor, crit)}
                {crit ? " (crits ignore armor)" : ""}.
              </p>
            )}
            {c.minion && <p className="small">Minion: any damage kills it; its attacks can't crit and ignore advantage (Core p.15).</p>}
            {c.legendary && (
              <p className="small">
                {c.lastStand
                  ? "Last Stand: it is Dying, and dies when these HP are gone (GMG p.39)."
                  : isBloodied(c)
                    ? "Bloodied: its Bloodied ability is now active (GMG p.39)."
                    : "Legendary: acts after each hero's turn; Bloodied at half HP (GMG p.39)."}
                {!c.lastStand && c.lastStandHp !== undefined && ` At 0 HP its Last Stand starts by itself (regains ${c.lastStandHp} HP).`}
              </p>
            )}
            {c.legendary && !c.lastStand && c.lastStandHp !== undefined && (
              <button type="button" className="mini" onClick={() => act("Last Stand", (d) => startLastStand(d, c.id))}>
                Start Last Stand now
              </button>
            )}
          </>
        )}
        {c.kind === "hero" && <p className="small">Heroes track their own HP on their sheets.</p>}
        <div className="chips">
          {c.conditions.map((x) => (
            <span key={x} className="chip">
              {x}
              <button type="button" aria-label={`Remove ${x} from ${c.name}`} onClick={() => act(`Remove ${x}`, (d) => removeCondition(d, c.id, x))}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="row">
          <select aria-label={`Condition for ${c.name}`} value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="">Add a condition…</option>
            {[...conditions.values()].map((x) => (
              <option key={x.id} value={x.name}>
                {x.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!condition}
            onClick={() => {
              act(`Add ${condition}`, (d) => addCondition(d, c.id, condition));
              setCondition("");
            }}
          >
            Add
          </button>
        </div>
        {monster && <MonsterDetails m={monster} />}
        <div className="row">
          <button type="button" className="mini" disabled={first} aria-label={`Move ${c.name} up`} onClick={() => act("Move up", (d) => moveCombatant(d, c.id, -1))}>
            ↑
          </button>
          <button type="button" className="mini" disabled={last} aria-label={`Move ${c.name} down`} onClick={() => act("Move down", (d) => moveCombatant(d, c.id, 1))}>
            ↓
          </button>
          {c.kind === "monster" && (
            <button type="button" className="mini" onClick={() => act(c.defeated ? "Revive" : "Defeat", (d) => setDefeated(d, c.id, !c.defeated))}>
              {c.defeated ? "Not defeated" : "Defeated"}
            </button>
          )}
          <button type="button" className="mini" onClick={() => window.confirm(`Remove ${c.name} from the fight?`) && act("Remove", (d) => removeCombatant(d, c.id))}>
            Remove
          </button>
        </div>
      </details>
    </li>
  );
}

export function TrackerTab({ onPlan }: { onPlan: () => void }) {
  const book = useCampaign();
  const { tracker, encounters } = book.get();
  const [name, setName] = useState("");
  const [hp, setHp] = useState("");

  if (!tracker.active) {
    return (
      <div className="tab-body">
        <p>No fight running.</p>
        <p className="small">
          Build one on the{" "}
          <button type="button" className="link" onClick={onPlan}>
            Encounters tab
          </button>{" "}
          and press Start in tracker.
        </p>
      </div>
    );
  }

  const encounter = encounters.find((e) => e.id === tracker.encounterId);
  const list = tracker.combatants;
  const standing = list.filter((c) => c.kind === "monster" && !c.defeated).length;
  return (
    <div className="tab-body">
      <div className="row space">
        <strong>
          {encounter?.name ?? "Fight"} · Round {tracker.round}
        </strong>
        <span className="small">{standing} monsters standing</span>
      </div>
      <p className="small">Heroes go first (any order); monsters usually act last, each group at the same time every round (Core p.13). Tick each one as it acts.</p>
      <div className="row">
        <button type="button" className="primary" onClick={() => void book.update("Next round", (d) => nextRound(d))}>
          Next round
        </button>
        <button type="button" onClick={() => window.confirm("End this fight?") && void book.update("End fight", (d) => endEncounter(d))}>
          End fight
        </button>
      </div>
      <ul className="rows">
        {list.map((c, i) => (
          <CombatantRow key={c.id} c={c} first={i === 0} last={i === list.length - 1} />
        ))}
      </ul>
      <details>
        <summary className="small">Add someone to the fight</summary>
        <div className="row">
          <input aria-label="Name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="small-input" aria-label="HP (blank for a hero)" placeholder="HP" inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value)} />
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              const h = Math.floor(Number(hp));
              const isMonster = hp.trim() !== "" && Number.isFinite(h);
              void book.update(`Add ${name.trim()}`, (d) =>
                addCombatant(d, { id: book.newId(), kind: isMonster ? "monster" : "hero", name: name.trim(), ...(isMonster ? { hp: Math.max(0, h), hpMax: Math.max(0, h) } : {}), armor: "none", minion: false, done: false, defeated: false, conditions: [] }),
              );
              setName("");
              setHp("");
            }}
          >
            Add
          </button>
        </div>
        <p className="small">Leave HP blank to add a hero.</p>
      </details>
    </div>
  );
}
