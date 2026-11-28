import { useMemo, useState } from "react";
import { changePrimary, describe, optionsFor, performRoll, toMessage, type RollKind, type RollOutcome, type RollRequest } from "../app/rolls";
import type { Character } from "../rules/persistence/character";
import type { Sheet, SheetAction } from "../rules/derive";
import { checkUse, isOffTurn, payUse, startCombat } from "../rules/play";
import { getContent } from "../data/content";
import { cryptoRng } from "../platform/random";
import type { RollMessage } from "../platform/types";
import { signed } from "./common";
import { useLibrary } from "./LibraryContext";
import { usePlatform } from "./PlatformContext";
import { useRollLog } from "./RollContext";

export interface RollTarget {
  kind: RollKind;
  label: string;
  action?: SheetAction | undefined;
  modifier?: number | undefined;
  /** Advantage the rules give (▲ save, Lithe Initiative). */
  baseAdvantage?: number | undefined;
  skill?: string | undefined;
  stat?: string | undefined;
  group?: string | undefined;
  creature?: string | undefined;
  /** Extra mana for upcasting. */
  manaCost?: number | undefined;
}

const PRIVACY_KEY = "nimble-bear:roll-privacy";
const loadPrivacy = (): RollMessage["privacy"] => {
  try {
    const v = localStorage.getItem(PRIVACY_KEY);
    return v === "gm" || v === "self" ? v : "public";
  } catch {
    return "public";
  }
};

export function RollDialog({ target, character, sheet, onClose }: { target: RollTarget; character: Character; sheet: Sheet; onClose: () => void }) {
  const { library } = useLibrary();
  const { platform } = usePlatform();
  const log = useRollLog();
  const [advantage, setAdvantage] = useState(target.baseAdvantage ?? 0);
  const [toggles, setToggles] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState<RollMessage["privacy"]>(loadPrivacy);
  const [outcome, setOutcome] = useState<RollOutcome | null>(null);
  const [request, setRequest] = useState<RollRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [primaryValue, setPrimaryValue] = useState(1);
  const [adjacent, setAdjacent] = useState(false);
  const offTurn = isOffTurn(character);

  const options = useMemo(
    () => optionsFor(sheet, target.kind, { skill: target.skill, stat: target.stat, group: target.group }, character.play.uses, offTurn),
    [sheet, target, character.play.uses, offTurn],
  );
  const costed = target.action && (target.action.actions !== undefined || target.manaCost !== undefined || target.action.manaCost !== undefined || target.action.resourceCost || target.action.limit);
  const check = target.action ? checkUse(character, sheet, target.action, { mana: target.manaCost, creature: target.creature }) : { ok: true, problems: [], rushed: 0 };
  const rushed = check.rushed;

  const share = async (req: RollRequest, out: RollOutcome) => {
    const m = toMessage(library.newId(), character.name, await platform.getPlayerName().catch(() => "Player"), req, out, privacy, new Date().toISOString());
    log.add(m);
    void platform.sendRoll(m);
  };

  const roll = async () => {
    if (!check.ok && !confirming) {
      setConfirming(true);
      return;
    }
    const req: RollRequest = { kind: target.kind, label: target.label, action: target.action, modifier: target.modifier, skill: target.skill, stat: target.stat, advantage: advantage - (adjacent ? 1 : 0), rushed, toggles, options };
    const out = performRoll(sheet, req, cryptoRng);
    setRequest(req);
    setOutcome(out);
    try {
      localStorage.setItem(PRIVACY_KEY, privacy);
    } catch {
      /* per-device convenience only */
    }
    // Pay costs and mark limited options used, as one undoable change.
    const crit = out.kind === "attack" && out.result.crit;
    library.update(
      character.id,
      (d) => {
        if (target.action && costed) payUse(d, sheet, target.action, { mana: target.manaCost, creature: target.creature });
        for (const v of options) {
          const used = v.how === "auto" ? (!v.onCrit || crit) : toggles.includes(v.option.id);
          const freeOffTurn = offTurn && v.option.limit?.per === "turn";
          if (used && !freeOffTurn && v.max !== null && v.option.change !== "setPrimary") d.play.uses[v.option.id] = (d.play.uses[v.option.id] ?? 0) + 1;
        }
        if (target.kind === "initiative" && out.kind === "d20") startCombat(d, sheet, getContent().core, out.floorTo ?? out.result.total, out.result.natural);
      },
      target.label,
    );
    await share(req, out);
  };

  const applyPrimary = async () => {
    if (outcome?.kind !== "attack" || !request || !outcome.canSetPrimary) return;
    const changed = changePrimary(outcome, primaryValue, cryptoRng);
    setOutcome({ ...changed, canSetPrimary: undefined });
    const opt = outcome.canSetPrimary.option.id;
    library.update(character.id, (d) => void (d.play.uses[opt] = (d.play.uses[opt] ?? 0) + 1), outcome.canSetPrimary.option.label);
    await share({ ...request, label: `${request.label} (${outcome.canSetPrimary.option.label})` }, changed);
  };

  const shown = outcome && request ? describe(outcome, request) : null;
  const primarySides = outcome?.kind === "attack" ? outcome.result.dice.find((d) => d.primary)?.sides : undefined;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={`Roll ${target.label}`} onClick={(e) => e.stopPropagation()}>
        <h2>{target.label}</h2>
        {target.action?.roll && <p className="small">{target.action.roll.formula}{target.action.roll.ignoresArmor ? " · ignores armor" : ""}{!target.action.roll.canCrit && target.action.roll.canMiss ? " · can't crit" : ""}</p>}
        {target.modifier !== undefined && <p className="small">d20 {signed(target.modifier)}</p>}

        {!shown && (
          <>
            <div className="row">
              <span>Advantage</span>
              <button type="button" aria-label="Less advantage" onClick={() => setAdvantage((a) => a - 1)}>
                −
              </button>
              <strong aria-live="polite">{advantage === 0 ? "none" : advantage > 0 ? `+${advantage}` : `${advantage} (disadvantage)`}</strong>
              <button type="button" aria-label="More advantage" onClick={() => setAdvantage((a) => a + 1)}>
                +
              </button>
            </div>
            {rushed > 0 && <p className="small">Rushed Attack: disadvantage {rushed} (Core Rules p.14).</p>}
            {target.group === "ranged" && (
              <label className="option compact">
                <input type="checkbox" checked={adjacent} onChange={(e) => setAdjacent(e.target.checked)} />
                <span>An enemy is adjacent to me (ranged attacks have disadvantage, Core Rules p.10)</span>
              </label>
            )}
            {offTurn && <p className="small">On another creature's turn: 1/turn abilities can be used again (Core Rules p.13).</p>}
            {sheet.dying && target.kind === "attack" && <p className="banner error">While Dying, attacking causes 1 Wound unless you succeed on a DC 10 STR save (Core Rules p.9).</p>}
            {options.length > 0 && (
              <fieldset className="choice">
                <legend>Bonuses</legend>
                {options.map((v) => {
                  const spent = v.max !== null && v.used >= v.max;
                  const situation = typeof v.option.when === "object" ? v.option.when.situation : "";
                  return (
                    <label key={v.option.id} className="option compact">
                      {v.how === "toggle" ? (
                        <input type="checkbox" disabled={spent} checked={toggles.includes(v.option.id)} onChange={() => setToggles((t) => (t.includes(v.option.id) ? t.filter((x) => x !== v.option.id) : [...t, v.option.id]))} />
                      ) : (
                        <span className={`badge ${v.how === "auto" ? "pass" : "pending"}`}>{v.how === "auto" ? (v.onCrit ? "on crit" : "auto") : "by hand"}</span>
                      )}
                      <span>
                        <strong>{v.option.label}</strong> <span className="small">{situation}</span>
                        {v.max !== null && <span className="small"> ({v.used}/{v.max} used)</span>}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
            <label className="field">
              Show to
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value as RollMessage["privacy"])}>
                <option value="public">Everyone</option>
                <option value="gm">GM only</option>
                <option value="self">Only me</option>
              </select>
            </label>
            {privacy === "gm" && <p className="small">GM-only rolls are hidden by every player's sheet, but aren't secret from someone inspecting network traffic.</p>}
            {confirming && (
              <ul className="problems">
                {check.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="row">
              <button type="button" className="primary" onClick={() => void roll()}>
                {confirming ? "Roll anyway" : "Roll"}
              </button>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {shown && (
          <div className="roll-result" aria-live="polite">
            <p className={`total ${shown.crit ? "crit" : ""} ${shown.miss ? "miss" : ""}`}>
              {shown.total}
              {shown.miss ? " · miss" : shown.crit ? (outcome?.kind === "d20" ? " · natural 20" : " · crit!") : ""}
            </p>
            <ul className="small">
              {shown.detail.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            {outcome?.kind === "attack" && outcome.canSetPrimary && !outcome.result.miss && primarySides && (
              <div className="row">
                <span>{outcome.canSetPrimary.option.label}: set Primary Die to</span>
                <input type="number" min={1} max={primarySides} value={primaryValue} onChange={(e) => setPrimaryValue(Number(e.target.value))} aria-label="New Primary Die value" />
                <button type="button" onClick={() => void applyPrimary()}>
                  Apply
                </button>
              </div>
            )}
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function RollLogView() {
  const log = useRollLog();
  const entries = log.list();
  if (entries.length === 0) return <p className="small">No rolls yet this session.</p>;
  return (
    <ul className="roll-log">
      {entries.map((m) => (
        <li key={m.id} className={m.crit ? "crit" : m.miss ? "miss" : ""}>
          <div>
            <strong>{m.character}</strong>: {m.label} <strong>{m.total}</strong>
            {m.privacy !== "public" && <span className="badge pending">{m.privacy === "gm" ? "GM only" : "Only me"}</span>}
          </div>
          <details>
            <summary className="small">{m.summary}</summary>
            <ul className="small">
              {m.detail.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
