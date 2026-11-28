import { useState } from "react";
import { getContent } from "../../data/content";
import { undoLastLevel } from "../../rules/build";
import { fieldRest, safeRest, spendHitDice } from "../../rules/play";
import { cryptoRng } from "../../platform/random";
import { RollLogView } from "../RollDialog";
import type { TabProps } from "./shared";

const OVERRIDABLE: { path: string; label: string }[] = [
  { path: "defense", label: "Defense" },
  { path: "initiative", label: "Initiative" },
  { path: "maxHp", label: "Max HP" },
  { path: "speed", label: "Speed" },
  { path: "maxWounds", label: "Max Wounds" },
  { path: "maxHitDice", label: "Max Hit Dice" },
  { path: "saveDc", label: "Save DC" },
  { path: "inventorySlots", label: "Inventory slots" },
];

interface Props extends Omit<TabProps, "onRoll"> {
  canLevelUp: boolean;
  onLevelUp: () => void;
  onSnapshots: () => void;
  onCopy: () => Promise<void>;
  onDelete: () => void;
}

export function MoreTab({ sheet, character, update, canLevelUp, onLevelUp, onSnapshots, onCopy, onDelete }: Props) {
  const content = getContent();
  const [hd, setHd] = useState(1);
  const [note, setNote] = useState("");
  return (
    <div>
      <section className="card">
        <h2>Rest</h2>
        <p className="small">
          Hit Dice {sheet.hitDice.remaining}/{sheet.hitDice.max} ({sheet.hitDice.die}). Field Rest (Core Rules p.16): Catch Breath rolls each die, Make Camp (8 hours with food and sleep) takes its max; add STR to each.
        </p>
        <div className="row">
          <label className="small">
            Dice{" "}
            <input type="number" className="small-input" min={1} max={Math.max(1, sheet.hitDice.remaining)} value={hd} onChange={(e) => setHd(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <button
            type="button"
            disabled={sheet.hitDice.remaining === 0}
            onClick={() => {
              let text = "";
              update("Catch Breath", (d) => {
                const r = spendHitDice(d, sheet, hd, "roll", cryptoRng);
                fieldRest(d, sheet);
                text = `Rolled ${r.rolls.join(", ")}: healed ${r.healed}.`;
              });
              setNote(text);
            }}
          >
            Catch Breath
          </button>
          <button
            type="button"
            disabled={sheet.hitDice.remaining === 0}
            onClick={() => {
              let text = "";
              update("Make Camp", (d) => {
                const r = spendHitDice(d, sheet, hd, "max", cryptoRng);
                fieldRest(d, sheet);
                text = `Healed ${r.healed}.`;
              });
              setNote(text);
            }}
          >
            Make Camp
          </button>
        </div>
        <p className="small">Safe Rest (p.17): full HP, Hit Dice, mana and class resources; heal 1 Wound; temp HP expire.</p>
        <button
          type="button"
          onClick={() => {
            if (!window.confirm("Take a Safe Rest?")) return;
            let healed = false;
            update("Safe Rest", (d) => void (healed = safeRest(d, sheet).woundHealed));
            setNote(`Safe Rest taken${healed ? ", 1 Wound healed" : ""}.`);
          }}
        >
          Safe Rest
        </button>
        {note && <p className="small" role="status">{note}</p>}
      </section>

      <section className="card">
        <h2>Level</h2>
        <div className="row">
          <button type="button" className="primary" disabled={!canLevelUp} onClick={onLevelUp}>
            Level up to {sheet.level + 1}
          </button>
          <button
            type="button"
            disabled={sheet.level <= 1}
            onClick={() => window.confirm(`Undo level ${sheet.level}? Its choices are removed (a snapshot was taken before the level-up).`) && update(`Undo level ${sheet.level}`, (d) => void undoLastLevel(content, d))}
          >
            Undo last level
          </button>
        </div>
        {sheet.level >= 3 && <p className="small">Levels above 3 arrive in Phase 4.</p>}
      </section>

      <h2>Roll log</h2>
      <RollLogView />

      <h2>Notes</h2>
      <textarea rows={5} value={character.play.notes} onChange={(e) => update("Edit notes", (d) => void (d.play.notes = e.target.value))} aria-label="Notes" />

      <details className="card">
        <summary>Table rules &amp; adjustments</summary>
        <label className="option compact">
          <input type="checkbox" checked={character.settings.deflect} onChange={() => update("Toggle Deflect!", (d) => void (d.settings.deflect = !d.settings.deflect))} />
          <span>
            <strong>Deflect!</strong> optional rule (Core Rules p.33)
          </span>
        </label>
        <p className="small">Override any number the sheet works out. Leave blank for automatic.</p>
        <table className="stats-table">
          <tbody>
            {OVERRIDABLE.map(({ path, label }) => {
              const o = character.overrides[path];
              return (
                <tr key={path}>
                  <th scope="row">{label}</th>
                  <td>
                    <input
                      type="number"
                      className="small-input"
                      value={typeof o === "number" ? o : ""}
                      placeholder="auto"
                      aria-label={`Override ${label}`}
                      onChange={(e) =>
                        update(`Override ${label}`, (d) => {
                          if (e.target.value === "") d.overrides = Object.fromEntries(Object.entries(d.overrides).filter(([k]) => k !== path));
                          else d.overrides[path] = Number(e.target.value);
                        })
                      }
                    />
                  </td>
                  <td>{sheet.overridden.includes(path) && <span className="badge pending">overridden</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>

      <details className="card">
        <summary>Backups</summary>
        <div className="button-grid">
          <button type="button" onClick={() => void onCopy()}>
            Copy as text
          </button>
          <button type="button" onClick={onSnapshots}>
            Snapshots
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Remove from this computer
          </button>
        </div>
      </details>
    </div>
  );
}
