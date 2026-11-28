import { useState } from "react";
import { applyDamage, heal, setTempHp } from "../../rules/play";
import type { TabProps } from "./shared";

/** Opened by tapping HP: an amount, quick-add buttons, and Damage / Heal / Set temp HP. */
export function HpPanel({ sheet, character, update, onClose }: Omit<TabProps, "onRoll"> & { onClose: () => void }) {
  const [amount, setAmount] = useState(0);
  const [crit, setCrit] = useState(false);
  const [note, setNote] = useState("");
  const add = (n: number) => setAmount((a) => Math.max(0, a + n));

  const damage = () => {
    let text = "";
    update(`Take ${amount} damage`, (d) => {
      const r = applyDamage(d, sheet, amount, { crit });
      text = [
        r.tempAbsorbed ? `${r.tempAbsorbed} absorbed by temp HP` : "",
        r.hpLost ? `lost ${r.hpLost} HP` : "",
        r.woundsGained ? `gained ${r.woundsGained} Wound${r.woundsGained > 1 ? "s" : ""}` : "",
        r.droppedToZero ? "you're Dying" : "",
        r.died ? "you have died" : "",
      ]
        .filter(Boolean)
        .join(", ");
    });
    setNote(text ? `${text[0]?.toUpperCase()}${text.slice(1)}.` : "No damage.");
    setAmount(0);
  };
  const doHeal = () => {
    let healed = 0;
    update(`Heal ${amount}`, (d) => void (healed = heal(d, sheet, amount).healed));
    setNote(`Healed ${healed} HP.`);
    setAmount(0);
  };
  const temp = () => {
    // Temp HP don't combine: keep one amount (Core Rules p.9).
    if (character.play.tempHp > 0 && !window.confirm(`Temp HP don't stack (Core Rules p.9). Replace your ${character.play.tempHp} temp HP with ${amount}?`)) return;
    update(`Set temp HP ${amount}`, (d) => setTempHp(d, amount));
    setNote(`Temp HP set to ${amount}.`);
    setAmount(0);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Change HP" onClick={(e) => e.stopPropagation()}>
        <div className="row space">
          <h2>Change HP</h2>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </div>
        <p>
          {sheet.hp.current} / {sheet.hp.max} HP{sheet.hp.temp ? ` · ${sheet.hp.temp} temp` : ""}
        </p>
        <label className="field">
          Amount
          <input type="number" min={0} inputMode="numeric" value={amount} onChange={(e) => setAmount(Math.max(0, Number.parseInt(e.target.value, 10) || 0))} autoFocus />
        </label>
        <div className="keypad">
          {[1, 2, 3, 5, 10].map((n) => (
            <button key={n} type="button" onClick={() => add(n)}>
              +{n}
            </button>
          ))}
          <button type="button" onClick={() => setAmount(0)}>
            Clear
          </button>
        </div>
        {sheet.dying && (
          <label className="option compact">
            <input type="checkbox" checked={crit} onChange={(e) => setCrit(e.target.checked)} />
            <span>That hit was a crit (3 Wounds while Dying instead of 2)</span>
          </label>
        )}
        <div className="hp-actions">
          <button type="button" className="danger-fill" disabled={amount === 0} onClick={damage}>
            Damage
          </button>
          <button type="button" className="pass-fill" disabled={amount === 0} onClick={doHeal}>
            Heal
          </button>
          <button type="button" disabled={amount === 0} onClick={temp}>
            Set temp HP
          </button>
        </div>
        {note && (
          <p className="small" role="status">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
