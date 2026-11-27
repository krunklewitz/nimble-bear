import { useState } from "react";
import { isUnsaved } from "../app/library";
import { getContent } from "../data/content";
import { STAT_IDS } from "../data/schema";
import { levelUpPlan, undoLastLevel } from "../rules/build";
import { derive, type Sheet, type SheetAction } from "../rules/derive";
import { toDice } from "../rules/formula";
import type { Character } from "../rules/persistence/character";
import { fingerprint } from "../rules/persistence/canonical";
import { applyDamage, endCombat, endTurn, heal, safeRest, fieldRest, setResource, setTempHp, spendHitDice } from "../rules/play";
import { copyText, downloadTextFile } from "../platform/files";
import { cryptoRng } from "../platform/random";
import { ChoicePicker, FeatureCard, SourceTag, signed } from "./common";
import { timeAgo } from "./format";
import { useLibrary } from "./LibraryContext";
import { usePlatform } from "./PlatformContext";
import { RollDialog, RollLogView, type RollTarget } from "./RollDialog";

type Tab = "play" | "actions" | "spells" | "features" | "gear" | "log" | "more";
const TABS: { id: Tab; label: string }[] = [
  { id: "play", label: "Play" },
  { id: "actions", label: "Actions" },
  { id: "spells", label: "Spells" },
  { id: "features", label: "Features" },
  { id: "gear", label: "Gear" },
  { id: "log", label: "Log" },
  { id: "more", label: "More" },
];

interface Props {
  id: string;
  onBack: () => void;
  onSnapshots: (id: string) => void;
  onLevelUp: (id: string) => void;
}

export function CharacterSheet({ id, onBack, onSnapshots, onLevelUp }: Props) {
  const { library } = useLibrary();
  const { platform } = usePlatform();
  const content = getContent();
  const entry = library.get(id);
  const character = entry?.status === "ok" ? entry.character : null;
  const sheet = character ? derive(content, character) : null;
  const [tab, setTab] = useState<Tab>("play");
  const [roll, setRoll] = useState<RollTarget | null>(null);
  const [dialog, setDialog] = useState<"none" | "end" | "ended" | "delete">("none");
  const [message, setMessage] = useState("");

  if (!character || !sheet || entry?.status !== "ok") {
    return (
      <section className="screen">
        <p>This character isn't on this computer.</p>
        <button type="button" onClick={onBack}>
          Back to characters
        </button>
      </section>
    );
  }

  const unsaved = isUnsaved(entry);
  const update = (label: string, fn: (d: Character) => void) => library.update(id, fn, label);
  const undo = library.undoLabel(id);

  const save = async () => {
    const { fileName, text } = await library.saveToFile(id);
    downloadTextFile(fileName, text);
    setMessage(`Saved ${fileName} to your Downloads folder.`);
    void platform.notify(`Saved ${fileName}`, "SUCCESS");
  };

  const plan = levelUpPlan(content, character, sheet);

  return (
    <section className="screen sheet" aria-labelledby="sheet-title">
      <div className="row space">
        <button type="button" className="link" onClick={onBack}>
          ← Characters
        </button>
        <button type="button" disabled={!undo} onClick={() => library.undo(id)} title={undo ? `Undo: ${undo}` : "Nothing to undo"}>
          ↶ Undo{undo ? `: ${undo}` : ""}
        </button>
      </div>
      <h1 id="sheet-title">{character.name}</h1>
      <p className="small">
        Level {sheet.level} {sheet.ancestry?.name} {sheet.cls?.name}
        {sheet.subclass ? ` (${sheet.subclass.name})` : ""} · {sheet.size}
      </p>

      <div className={`save-status ${unsaved ? "pending" : "pass"}`} role="status">
        <strong>{unsaved ? "● Unsaved changes since the last file save" : `✓ Saved to file ${timeAgo(entry.meta.lastSavedAt)}`}</strong>
        <span className="small">
          Fingerprint <code>{entry.checksum ? fingerprint(entry.checksum) : "…"}</code>
        </span>
        <div className="row">
          <button type="button" className="primary" onClick={() => void save()}>
            Save character file
          </button>
          <button type="button" onClick={() => setDialog("end")}>
            End session
          </button>
        </div>
        {message && <span className="small">{message}</span>}
      </div>
      {dialog === "end" && (
        <div className="panel" role="dialog" aria-label="End session">
          <p>{unsaved ? "You have changes that aren't in a character file yet. Save one now so your hero is safe on any computer." : "Your character file is up to date."}</p>
          <div className="row">
            {unsaved && (
              <button type="button" className="primary" onClick={() => void save()}>
                Save character file
              </button>
            )}
            <button type="button" onClick={() => void library.endSession(id).then(() => setDialog("ended"))}>
              {unsaved ? "End without saving a file" : "End session"}
            </button>
            <button type="button" className="link" onClick={() => setDialog("none")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {dialog === "ended" && <p className="panel">Session ended. You can close Owlbear.</p>}
      {library.storageError && <p className="banner error">Couldn't save to this browser: {library.storageError}. Save your character file now.</p>}
      {sheet.warnings.map((w) => (
        <p key={w} className="banner error">
          {w}
        </p>
      ))}

      {!sheet.cls ? (
        <div className="panel">
          <p>
            <strong>{character.name}</strong> is a test character from before classes existed (Phase 2), so there's no sheet to show. Make a new hero from the character list..
          </p>
          <button type="button" className="danger" onClick={() => setDialog("delete")}>
            Remove from this computer
          </button>
        </div>
      ) : (
        <>
      <Vitals sheet={sheet} character={character} update={update} onRoll={setRoll} />

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "current" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "play" && <PlayTab sheet={sheet} character={character} update={update} onRoll={setRoll} />}
      {tab === "actions" && <ActionsTab sheet={sheet} character={character} onRoll={setRoll} update={update} />}
      {tab === "spells" && <SpellsTab sheet={sheet} onRoll={setRoll} />}
      {tab === "features" && <FeaturesTab sheet={sheet} character={character} update={update} />}
      {tab === "gear" && <GearTab sheet={sheet} character={character} update={update} />}
      {tab === "log" && <RollLogView />}
      {tab === "more" && (
        <MoreTab
          sheet={sheet}
          character={character}
          update={update}
          canLevelUp={plan !== null}
          onLevelUp={() => onLevelUp(id)}
          onSnapshots={() => onSnapshots(id)}
          onCopy={async () => {
            try {
              await copyText(await library.fileText(id));
              setMessage("Copied the character file as text. This doesn't replace saving a file.");
            } catch {
              setMessage("Couldn't copy to the clipboard.");
            }
          }}
          onDelete={() => setDialog("delete")}
        />
      )}
        </>
      )}
      {dialog === "delete" && (
        <div className="panel" role="dialog" aria-label="Remove character">
          <p>Remove {character.name} from this computer? A snapshot is kept, and your saved files aren't touched.</p>
          <div className="row">
            <button type="button" className="danger" onClick={() => void library.deleteCharacter(id).then(onBack)}>
              Remove
            </button>
            <button type="button" className="link" onClick={() => setDialog("none")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {roll && <RollDialog target={roll} character={character} sheet={sheet} onClose={() => setRoll(null)} />}
    </section>
  );
}

interface TabProps {
  sheet: Sheet;
  character: Character;
  update: (label: string, fn: (d: Character) => void) => void;
}

function Vitals({ sheet, character, update, onRoll }: TabProps & { onRoll: (t: RollTarget) => void }) {
  const [amount, setAmount] = useState("");
  const [crit, setCrit] = useState(false);
  const [note, setNote] = useState("");
  const n = Math.max(0, Number.parseInt(amount, 10) || 0);
  const hpPct = Math.max(0, Math.min(100, (sheet.hp.current / Math.max(1, sheet.hp.max)) * 100));

  return (
    <div className="vitals">
      <div className="hp">
        <div className="hp-bar" aria-hidden="true">
          <span style={{ width: `${hpPct}%` }} className={sheet.bloodied ? "bloodied" : ""} />
        </div>
        <p>
          <strong className="big-num">{sheet.hp.current}</strong> / {sheet.hp.max} HP
          {sheet.hp.temp > 0 && <span className="badge pass"> +{sheet.hp.temp} temp</span>}
          {sheet.dying && !sheet.dead && <span className="badge fail"> Dying</span>}
          {sheet.dead && <span className="badge fail"> Dead</span>}
          {sheet.bloodied && !sheet.dying && <span className="badge pending"> Bloodied</span>}
        </p>
        <div className="row">
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" placeholder="Amount" className="small-input" />
          <button
            type="button"
            disabled={n === 0}
            onClick={() => {
              let text = "";
              update(`Take ${n} damage`, (d) => {
                const r = applyDamage(d, sheet, n, { crit });
                text = [r.tempAbsorbed ? `${r.tempAbsorbed} absorbed by temp HP` : "", r.hpLost ? `−${r.hpLost} HP` : "", r.woundsGained ? `+${r.woundsGained} Wound${r.woundsGained > 1 ? "s" : ""}` : "", r.died ? "You have died." : ""].filter(Boolean).join(", ");
              });
              setNote(text);
              setAmount("");
            }}
          >
            Damage
          </button>
          <button
            type="button"
            disabled={n === 0}
            onClick={() => {
              update(`Heal ${n}`, (d) => void heal(d, sheet, n));
              setNote("");
              setAmount("");
            }}
          >
            Heal
          </button>
          <button
            type="button"
            disabled={n === 0}
            onClick={() => {
              if (character.play.tempHp > 0 && !window.confirm(`Temp HP don't stack (Core Rules p.9). Replace ${character.play.tempHp} temp HP with ${n}?`)) return;
              update(`Set temp HP ${n}`, (d) => setTempHp(d, n));
              setAmount("");
            }}
          >
            Temp HP
          </button>
        </div>
        {sheet.dying && (
          <label className="small">
            <input type="checkbox" checked={crit} onChange={(e) => setCrit(e.target.checked)} /> That hit was a crit (3 Wounds while Dying)
          </label>
        )}
        {note && <p className="small" role="status">{note}</p>}
      </div>

      <div className="stat-boxes">
        <div className="box">
          <span className="label">Wounds</span>
          <span className="pips" aria-label={`${sheet.wounds.current} of ${sheet.wounds.max} Wounds`}>
            {Array.from({ length: sheet.wounds.max }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`pip ${i < sheet.wounds.current ? "on fail" : ""}`}
                aria-label={`Set Wounds to ${i < sheet.wounds.current ? i : i + 1}`}
                onClick={() => update("Change Wounds", (d) => void (d.play.wounds = i < sheet.wounds.current ? i : i + 1))}
              />
            ))}
          </span>
        </div>
        <div className="box" title={sheet.defense.parts.map((p) => `${p.label} ${signed(p.value)}`).join(", ")}>
          <span className="label">Defense</span>
          <strong>{sheet.defense.value}</strong>
        </div>
        <button type="button" className="box" onClick={() => onRoll({ kind: "initiative", label: "Initiative", modifier: sheet.initiative.mod, baseAdvantage: sheet.initiative.advantage })}>
          <span className="label">Initiative</span>
          <strong>{signed(sheet.initiative.mod)}</strong>
        </button>
        <div className="box">
          <span className="label">Speed</span>
          <strong>{sheet.speed}</strong>
        </div>
        <div className="box">
          <span className="label">Hit Dice</span>
          <strong>
            {sheet.hitDice.remaining}/{sheet.hitDice.max}
          </strong>
          <span className="small">{sheet.hitDice.die}</span>
        </div>
        <div className="box">
          <span className="label">Save DC</span>
          <strong>{sheet.saveDc}</strong>
        </div>
      </div>

      {sheet.resources.length > 0 && (
        <div className="resources">
          {sheet.resources.map((r) => (
            <div key={r.def.id} className="resource">
              <span>{r.def.name}</span>
              <button type="button" aria-label={`Spend 1 ${r.def.name}`} onClick={() => update(`${r.def.name} −1`, (d) => setResource(d, sheet, r.def.id, r.current - 1))}>
                −
              </button>
              <strong>
                {r.current}/{r.max}
              </strong>
              <button type="button" aria-label={`Regain 1 ${r.def.name}`} onClick={() => update(`${r.def.name} +1`, (d) => setResource(d, sheet, r.def.id, r.current + 1))}>
                +
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayTab({ sheet, character, update, onRoll }: TabProps & { onRoll: (t: RollTarget) => void }) {
  const content = getContent();
  const combat = character.play.combat;
  const [hd, setHd] = useState(1);
  const [restNote, setRestNote] = useState("");
  const [addCondition, setAddCondition] = useState("");
  const conditions = [...content.conditions.values()];
  return (
    <div>
      <div className="panel">
        <h2>Combat</h2>
        {combat.active ? (
          <>
            <p>
              Round {combat.round} · Actions left{" "}
              <span className="pips">
                {Array.from({ length: Math.max(3, combat.actions) }, (_, i) => (
                  <span key={i} className={`pip ${i < combat.actions ? "on" : ""}`} />
                ))}
              </span>
              <button type="button" aria-label="Spend an action" onClick={() => update("Spend action", (d) => void (d.play.combat.actions = Math.max(0, d.play.combat.actions - 1)))}>
                −
              </button>
              <button type="button" aria-label="Gain an action" onClick={() => update("Gain action", (d) => void (d.play.combat.actions += 1))}>
                +
              </button>
            </p>
            {sheet.dying && <p className="small">Dying: max 1 action (Core Rules p.9).</p>}
            <div className="row">
              <button type="button" className="primary" onClick={() => update("End turn", (d) => endTurn(d, sheet))}>
                End turn
              </button>
              <button type="button" onClick={() => update("End combat", (d) => endCombat(d, sheet))}>
                End combat
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="primary" onClick={() => onRoll({ kind: "initiative", label: "Initiative", modifier: sheet.initiative.mod, baseAdvantage: sheet.initiative.advantage })}>
            Roll Initiative (starts combat)
          </button>
        )}
      </div>

      <h2>Stats and saves</h2>
      <table className="stats-table">
        <tbody>
          {STAT_IDS.map((s) => {
            const save = sheet.saves[s];
            return (
              <tr key={s}>
                <th scope="row">{s}</th>
                <td>{signed(sheet.stats[s])}</td>
                <td>
                  <button type="button" onClick={() => onRoll({ kind: "save", label: `${s} save`, modifier: save.mod, baseAdvantage: save.advantage, stat: s })}>
                    Save {signed(save.mod)} {save.advantage > 0 ? "▲" : save.advantage < 0 ? "▼" : ""}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Skills</h2>
      <div className="skill-grid">
        {sheet.skills.map((sk) => (
          <button key={sk.id} type="button" className="skill" onClick={() => onRoll({ kind: "check", label: `${sk.name} check`, modifier: sk.total, skill: sk.id, stat: sk.stat })}>
            <span>{sk.name}</span>
            <strong>{signed(sk.total)}</strong>
          </button>
        ))}
      </div>

      {sheet.toggles.length > 0 && (
        <>
          <h2>Situations</h2>
          {sheet.toggles.map((t) => (
            <label key={t.id} className="option compact">
              <input type="checkbox" checked={t.on} onChange={() => update(`${t.on ? "Clear" : "Set"}: ${t.label}`, (d) => void (d.play.flags[t.id] = !t.on))} />
              <span>
                {t.label} <span className="small">({t.describes})</span>
              </span>
            </label>
          ))}
        </>
      )}

      <h2>Conditions</h2>
      {character.play.conditions.length === 0 && <p className="small">None.</p>}
      <ul className="char-list">
        {character.play.conditions.map((c, i) => {
          const def = content.conditions.get(c.id);
          return (
            <li key={`${c.id}-${i}`} className="panel">
              <strong>{def?.name ?? c.id}</strong> <span className="small">{def?.text}</span>{" "}
              <button type="button" className="link" onClick={() => update(`Remove ${def?.name ?? c.id}`, (d) => void d.play.conditions.splice(i, 1))}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      <div className="row">
        <select value={addCondition} onChange={(e) => setAddCondition(e.target.value)} aria-label="Add a condition">
          <option value="">Add a condition…</option>
          {conditions.map((c) => (
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

      <h2>Rest</h2>
      <div className="panel">
        <p className="small">Field Rest (Core Rules p.16): spend Hit Dice to heal. Catch Breath rolls them; Make Camp (8 hours, food and sleep) uses their max. STR is added to each.</p>
        <div className="row">
          <label>
            Hit Dice{" "}
            <input type="number" className="small-input" min={1} max={sheet.hitDice.remaining} value={hd} onChange={(e) => setHd(Number(e.target.value))} />
          </label>
          <button
            type="button"
            disabled={sheet.hitDice.remaining === 0}
            onClick={() => {
              let text = "";
              update("Catch Breath", (d) => {
                const r = spendHitDice(d, sheet, hd, "roll", cryptoRng);
                fieldRest(d, sheet);
                text = `Rolled ${r.rolls.join(", ")} → healed ${r.healed}.`;
              });
              setRestNote(text);
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
              setRestNote(text);
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
            setRestNote(`Safe Rest taken${healed ? ", 1 Wound healed" : ""}.`);
          }}
        >
          Safe Rest
        </button>
        {restNote && <p className="small" role="status">{restNote}</p>}
      </div>
      {sheet.hooks.length > 0 && (
        <>
          <h2>Reminders</h2>
          <ul className="small">
            {sheet.hooks.map((h) => (
              <li key={h.sourceId + h.on}>
                {h.on === "woundGained" ? "When you gain a Wound: " : `${h.on}: `}
                {h.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const BASIC_ACTIONS = [
  { name: "Move", text: "Traverse spaces up to your Speed (1 action each time)." },
  { name: "Assess", text: "Make a DC 10 skill check to ask a question, create an opening, or anticipate danger." },
  { name: "Defend (reaction)", text: "Reduce incoming damage from a single attack by your Defense. Crits ignore Defense." },
  { name: "Interpose (reaction)", text: "Become the new target of an attack against a creature within Reach 2." },
  { name: "Opportunity Attack (reaction)", text: "A melee attack with disadvantage against an adjacent creature as it willingly moves away." },
  { name: "Help (reaction)", text: "Allow an ally to reroll if you can reasonably explain how you could help them." },
];

function ActionsTab({ sheet, character, onRoll }: TabProps & { onRoll: (t: RollTarget) => void }) {
  const rollFor = (a: SheetAction): RollTarget => ({
    kind: a.roll?.kind === "heal" ? "heal" : a.roll ? "attack" : "plain",
    label: a.name,
    action: a,
    group: a.kind === "weapon" ? (a.range && !a.range.includes("thrown") ? "ranged" : "melee") : undefined,
    creature: a.sourceId === "feature.shepherd.my-buddy" ? "companion" : "hero",
  });
  const shield = sheet.defense.shield;
  return (
    <div>
      {sheet.actions.length === 0 && <p className="small">No attacks or abilities. Add a weapon on the Gear tab.</p>}
      {sheet.actions.map((a) => (
        <div key={a.id} className="action">
          <div className="row space">
            <strong>{a.name}</strong>
            <span className="small">
              {a.actions !== undefined ? `${a.actions} action${a.actions === 1 ? "" : "s"}` : a.kind}
              {a.reach ? ` · Reach ${a.reach}` : ""}
              {a.range ? ` · Range ${a.range}` : ""}
              {a.limit ? ` · ${a.limit.max - a.limit.used}/${a.limit.max} per ${a.limit.per}` : ""}
            </span>
          </div>
          <p className="small">{a.text}</p>
          {a.kind !== "passive" && (
            <button type="button" onClick={() => onRoll(rollFor(a))}>
              {a.roll ? `Roll ${a.roll.formula}` : "Use"}
            </button>
          )}
        </div>
      ))}
      <h2>Basic actions (Core Rules p.14–15)</h2>
      <p className="small">Defense {sheet.defense.value} ({sheet.defense.parts.map((p) => `${p.label} ${signed(p.value)}`).join(", ")}).</p>
      {shield > 0 && character.settings.deflect && (
        <p className="panel small">
          <strong>Deflect!</strong> (optional rule, Core Rules p.33): instead of adding your shield's +{shield} to your Defense, you may reduce the damage of an attack by {shield} for free, 1/round.
        </p>
      )}
      <ul className="small">
        {BASIC_ACTIONS.map((b) => (
          <li key={b.name}>
            <strong>{b.name}.</strong> {b.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpellsTab({ sheet, onRoll }: { sheet: Sheet; onRoll: (t: RollTarget) => void }) {
  const [upcast, setUpcast] = useState<Record<string, number>>({});
  if (sheet.spells.known.length === 0) return <p className="small">No spells.</p>;
  const tiers = [...new Set(sheet.spells.known.map((s) => (s.def.tier === "utility" ? "utility" : s.def.tier)))];
  return (
    <div>
      <p className="small">
        Schools: {sheet.spells.schools.join(", ") || "none"} · Highest tier: {sheet.spells.maxTier}
        {sheet.mana ? ` · Mana ${sheet.mana.current}/${sheet.mana.max}` : ""}
      </p>
      {tiers.map((t) => (
        <div key={String(t)}>
          <h2>{t === 0 ? "Cantrips" : t === "utility" ? "Utility spells" : `Tier ${t}`}</h2>
          {sheet.spells.known
            .filter((s) => (s.def.tier === "utility" ? "utility" : s.def.tier) === t)
            .map((s) => {
              const tierNum = typeof s.def.tier === "number" ? s.def.tier : 0;
              const extra = upcast[s.def.id] ?? 0;
              const cost = s.cost + extra;
              const action: SheetAction = {
                id: s.def.id,
                name: s.def.name,
                kind: "spell",
                actions: s.def.actions,
                manaCost: cost,
                roll: s.def.roll
                  ? (() => {
                      try {
                        return {
                          kind: s.def.roll.kind,
                          dice: toDiceSafe(s.def.roll.dice, sheet),
                          formula: s.def.roll.dice,
                          damageType: s.def.roll.damageType,
                          ignoresArmor: s.def.roll.ignoresArmor,
                          canCrit: s.def.roll.kind === "damage" && !s.def.roll.noCrit,
                          canMiss: s.def.roll.kind === "damage",
                          vicious: false,
                        };
                      } catch {
                        return undefined;
                      }
                    })()
                  : undefined,
                text: s.def.text,
                sourceId: s.def.id,
              };
              return (
                <div key={s.def.id} className="action">
                  <div className="row space">
                    <strong>{s.def.name}</strong>
                    <span className="small">
                      {s.def.actions !== undefined ? `${s.def.actions} action${s.def.actions === 1 ? "" : "s"}` : s.def.castingTime}
                      {s.def.aoe ? " · AoE" : ""}
                      {tierNum > 0 ? ` · ${cost} mana` : ""}
                    </span>
                  </div>
                  {s.def.restriction && <p className="small">
                    <em>{s.def.restriction}</em>
                  </p>}
                  <p className="small">{s.def.text}</p>
                  {s.def.upcast && <p className="small">
                    <strong>Upcast:</strong> {s.def.upcast}
                  </p>}
                  {s.def.highLevels && <p className="small">
                    <strong>High Levels:</strong> {s.def.highLevels}
                  </p>}
                  <div className="row">
                    {tierNum > 0 && s.def.upcast && sheet.spells.maxTier > tierNum && (
                      <label className="small">
                        Upcast +
                        <input type="number" className="small-input" min={0} max={sheet.spells.maxTier - tierNum} value={extra} onChange={(e) => setUpcast({ ...upcast, [s.def.id]: Math.max(0, Math.min(sheet.spells.maxTier - tierNum, Number(e.target.value))) })} /> mana
                      </label>
                    )}
                    <button type="button" onClick={() => onRoll({ kind: action.roll ? (action.roll.kind === "heal" ? "heal" : "attack") : "plain", label: s.def.name, action, manaCost: cost })}>
                      {action.roll ? `Cast · roll ${action.roll.formula}` : "Cast"}
                    </button>
                    <SourceTag source={s.def.source} />
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

const toDiceSafe = (formula: string, sheet: Sheet) => toDice(formula, sheet.scope);

function FeaturesTab({ sheet, character, update }: TabProps) {
  const unanswered = sheet.choices.filter((c) => c.selected.length < c.choice.count && c.choice.from.kind !== "save" && typeof c.where === "number");
  return (
    <div>
      {unanswered.length > 0 && (
        <div className="panel">
          <h2>Choices to make</h2>
          {unanswered.map((c) => (
            <ChoicePicker
              key={c.choice.id}
              choice={c.choice}
              options={c.options}
              value={c.selected}
              onChange={(v) =>
                update(`Choose: ${c.choice.prompt}`, (d) => {
                  const rec = d.build.levels.find((l) => l.level === c.where);
                  if (rec) rec.choices[c.choice.id] = v;
                })
              }
            />
          ))}
        </div>
      )}
      {(["class", "subclass", "ancestry", "background"] as const).map((src) => {
        const list = sheet.features.filter((f) => f.source === src);
        if (list.length === 0) return null;
        return (
          <div key={src}>
            <h2>{src === "class" ? sheet.cls?.name : src === "subclass" ? sheet.subclass?.name : src === "ancestry" ? sheet.ancestry?.name : sheet.background?.name}</h2>
            {list.map((f) => (
              <div key={f.def.id} className={f.replacedBy ? "replaced" : ""}>
                <FeatureCard feature={f.def} note={`${f.level ? `Level ${f.level}` : ""}${f.replacedBy ? " · replaced by your subclass" : ""}`} />
              </div>
            ))}
          </div>
        );
      })}
      <p className="small">Languages: {sheet.languages.join(", ")}{character.build.languages.length < sheet.extraLanguageSlots ? ` (you can learn ${sheet.extraLanguageSlots - character.build.languages.length} more)` : ""}</p>
    </div>
  );
}

function GearTab({ sheet, character, update }: TabProps) {
  const content = getContent();
  const [pick, setPick] = useState("");
  const all = [
    ...[...content.weapons.values()].map((x) => ({ id: x.id, name: `${x.name} (weapon)`, wearable: true })),
    ...[...content.armor.values()].map((x) => ({ id: x.id, name: `${x.name} (armor)`, wearable: true })),
    ...[...content.shields.values()].map((x) => ({ id: x.id, name: `${x.name} (shield)`, wearable: true })),
    ...[...content.gear.values()].map((x) => ({ id: x.id, name: x.name, wearable: false })),
  ];
  return (
    <div>
      <p className="small">
        Slots used {sheet.inventorySlots.used}/{sheet.inventorySlots.max} (Core Rules p.21; small related items can share a slot).
      </p>
      <ul className="char-list">
        {character.play.inventory.map((it, i) => {
          const wearable = !!it.itemId && (content.weapons.has(it.itemId) || content.armor.has(it.itemId) || content.shields.has(it.itemId));
          return (
            <li key={`${it.itemId ?? it.name}-${i}`} className="row space panel">
              <span>
                <strong>{it.name}</strong> ×{it.qty}
              </span>
              <span className="row">
                {wearable && (
                  <label className="small">
                    <input type="checkbox" checked={it.equipped} onChange={() => update(`${it.equipped ? "Unequip" : "Equip"} ${it.name}`, (d) => void ((d.play.inventory[i] as { equipped: boolean }).equipped = !it.equipped))} /> equipped
                  </label>
                )}
                <button type="button" aria-label={`One fewer ${it.name}`} onClick={() => update(`${it.name} −1`, (d) => {
                  const row = d.play.inventory[i];
                  if (!row) return;
                  if (row.qty <= 1) d.play.inventory.splice(i, 1);
                  else row.qty -= 1;
                })}>
                  −
                </button>
                <button type="button" aria-label={`One more ${it.name}`} onClick={() => update(`${it.name} +1`, (d) => void ((d.play.inventory[i] as { qty: number }).qty += 1))}>
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="row">
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add an item">
          <option value="">Add an item…</option>
          {all.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pick}
          onClick={() => {
            const x = all.find((a) => a.id === pick);
            if (!x) return;
            update(`Add ${x.name}`, (d) => void d.play.inventory.push({ itemId: x.id, name: x.name.replace(/ \((weapon|armor|shield)\)$/, ""), qty: 1, equipped: false, notes: "" }));
            setPick("");
          }}
        >
          Add
        </button>
      </div>
      <label className="field">
        Gold
        <input type="number" min={0} value={character.play.gold} onChange={(e) => update("Change gold", (d) => void (d.play.gold = Math.max(0, Number(e.target.value) || 0)))} />
      </label>
    </div>
  );
}

const OVERRIDABLE = ["defense", "initiative", "maxHp", "speed", "maxWounds", "maxHitDice", "saveDc", "inventorySlots"];

function MoreTab({
  sheet,
  character,
  update,
  canLevelUp,
  onLevelUp,
  onSnapshots,
  onCopy,
  onDelete,
}: TabProps & { canLevelUp: boolean; onLevelUp: () => void; onSnapshots: () => void; onCopy: () => Promise<void>; onDelete: () => void }) {
  const content = getContent();
  return (
    <div>
      <h2>Level</h2>
      <div className="row">
        <button type="button" className="primary" disabled={!canLevelUp} onClick={onLevelUp}>
          Level up to {sheet.level + 1}
        </button>
        <button
          type="button"
          disabled={sheet.level <= 1}
          onClick={() => {
            if (window.confirm(`Undo level ${sheet.level}? Its choices are removed (a snapshot was taken before the level-up).`)) update(`Undo level ${sheet.level}`, (d) => void undoLastLevel(content, d));
          }}
        >
          Undo last level
        </button>
      </div>
      {sheet.level >= 3 && <p className="small">Levels above 3 arrive in Phase 4.</p>}

      <h2>Notes</h2>
      <textarea rows={5} value={character.play.notes} onChange={(e) => update("Edit notes", (d) => void (d.play.notes = e.target.value))} aria-label="Notes" />

      <h2>Table rules</h2>
      <label className="option compact">
        <input type="checkbox" checked={character.settings.deflect} onChange={() => update("Toggle Deflect!", (d) => void (d.settings.deflect = !d.settings.deflect))} />
        <span>
          <strong>Deflect!</strong> optional rule (Core Rules p.33)
        </span>
      </label>

      <h2>Adjust values</h2>
      <p className="small">Override any number the sheet works out. Overridden values are marked and can be reset.</p>
      <table className="stats-table">
        <tbody>
          {OVERRIDABLE.map((path) => {
            const o = character.overrides[path];
            return (
              <tr key={path}>
                <th scope="row">{path}</th>
                <td>
                  <input
                    type="number"
                    className="small-input"
                    value={typeof o === "number" ? o : ""}
                    placeholder="auto"
                    onChange={(e) =>
                      update(`Override ${path}`, (d) => {
                        if (e.target.value === "") d.overrides = Object.fromEntries(Object.entries(d.overrides).filter(([k]) => k !== path));
                        else d.overrides[path] = Number(e.target.value);
                      })
                    }
                    aria-label={`Override ${path}`}
                  />
                </td>
                <td>{sheet.overridden.includes(path) && <span className="badge pending">overridden</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Backups</h2>
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
    </div>
  );
}
