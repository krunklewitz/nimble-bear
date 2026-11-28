import { adjustWounds } from "../../rules/play";
import type { TabProps } from "./shared";

/** Opened by tapping Wounds: add or remove Wounds by hand. */
export function WoundsPanel({ sheet, update, onClose }: Omit<TabProps, "onRoll" | "character"> & { onClose: () => void }) {
  const { current, max } = sheet.wounds;
  const change = (delta: number) => update(delta > 0 ? "Gain a Wound" : "Remove a Wound", (d) => void adjustWounds(d, sheet, delta));
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Wounds" onClick={(e) => e.stopPropagation()}>
        <div className="row space">
          <h2>Wounds</h2>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="wound-pips" aria-label={`${current} of ${max} Wounds`}>
          {Array.from({ length: max }, (_, i) => (
            <span key={i} className={`pip big ${i < current ? "on fail" : ""}`} />
          ))}
          <strong>
            {" "}
            {current}/{max}
          </strong>
        </p>
        <div className="hp-actions">
          <button type="button" className="danger-fill" disabled={current >= max} onClick={() => change(1)}>
            Gain a Wound
          </button>
          <button type="button" className="pass-fill" disabled={current <= 0} onClick={() => change(-1)}>
            Remove a Wound
          </button>
        </div>
        {sheet.dead && <p className="banner error">At {max} Wounds your hero dies (Core Rules p.9).</p>}
        <p className="small">
          Dropping to 0 HP adds a Wound automatically, and a Safe Rest heals 1 (Core Rules p.9, p.17). Use these buttons for anything else that causes or heals Wounds.
        </p>
      </div>
    </div>
  );
}
