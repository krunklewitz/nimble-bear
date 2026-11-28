import { useState } from "react";
import { isUnsaved } from "../app/library";
import { getContent } from "../data/content";
import { levelUpPlan } from "../rules/build";
import { derive } from "../rules/derive";
import type { Character } from "../rules/persistence/character";
import { fingerprint } from "../rules/persistence/canonical";
import { applyDamage, heal, setResource } from "../rules/play";
import { copyText, downloadTextFile } from "../platform/files";
import { timeAgo } from "./format";
import { useLibrary } from "./LibraryContext";
import { usePlatform } from "./PlatformContext";
import { RollDialog, type RollTarget } from "./RollDialog";
import { CharacterTab } from "./sheet/CharacterTab";
import { CombatTab } from "./sheet/CombatTab";
import { GearTab } from "./sheet/GearTab";
import { HpPanel } from "./sheet/HpPanel";
import { MoreTab } from "./sheet/MoreTab";
import { WoundsPanel } from "./sheet/WoundsPanel";

type Tab = "combat" | "character" | "gear" | "more";
const TABS: { id: Tab; label: string }[] = [
  { id: "combat", label: "Combat" },
  { id: "character", label: "Character" },
  { id: "gear", label: "Gear" },
  { id: "more", label: "More" },
];
const TAB_KEY = "nimble-bear:sheet-tab";
const loadTab = (): Tab => {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return TABS.some((x) => x.id === t) ? (t as Tab) : "combat";
  } catch {
    return "combat";
  }
};

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
  const [tab, setTabState] = useState<Tab>(loadTab);
  const [roll, setRoll] = useState<RollTarget | null>(null);
  const [panel, setPanel] = useState<"none" | "hp" | "wounds" | "save" | "ended" | "delete">("none");
  const [message, setMessage] = useState("");
  const entry = library.get(id);
  const character = entry?.status === "ok" ? entry.character : null;
  const sheet = character ? derive(content, character) : null;

  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* per-device convenience */
    }
  };

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
  const combat = character.play.combat;

  const save = async () => {
    const { fileName, text } = await library.saveToFile(id);
    downloadTextFile(fileName, text);
    setMessage(`Saved ${fileName} to your Downloads folder.`);
    void platform.notify(`Saved ${fileName}`, "SUCCESS");
  };

  const deleteDialog = panel === "delete" && (
    <div className="dialog-backdrop" role="presentation" onClick={() => setPanel("none")}>
      <div className="dialog" role="dialog" aria-label="Remove character" onClick={(e) => e.stopPropagation()}>
        <p>Remove {character.name} from this computer? A snapshot is kept, and your saved files aren't touched.</p>
        <div className="row">
          <button type="button" className="danger" onClick={() => void library.deleteCharacter(id).then(onBack)}>
            Remove
          </button>
          <button type="button" onClick={() => setPanel("none")}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  if (!sheet.cls) {
    return (
      <section className="screen">
        <button type="button" className="link" onClick={onBack}>
          ← Characters
        </button>
        <h1>{character.name}</h1>
        <p className="card">This is a test character from before classes existed (Phase 2), so there's no sheet to show. Make a new hero from the character list.</p>
        <button type="button" className="danger" onClick={() => setPanel("delete")}>
          Remove from this computer
        </button>
        {deleteDialog}
      </section>
    );
  }

  const hpPct = Math.max(0, Math.min(100, (sheet.hp.current / Math.max(1, sheet.hp.max)) * 100));

  return (
    <section className="sheet" aria-labelledby="sheet-title">
      {/* Sticky bar: who, HP, Wounds, Defense, actions, resources, save state */}
      <header className="sticky-bar">
        <div className="bar-row">
          <button type="button" className="link back" onClick={onBack} aria-label="Back to characters">
            ←
          </button>
          <h1 id="sheet-title" className="bar-title">
            {character.name} <span className="small">{sheet.cls.name} {sheet.level}</span>
          </h1>
          <button type="button" className="icon-btn" disabled={!undo} onClick={() => library.undo(id)} title={undo ? `Undo: ${undo}` : "Nothing to undo"} aria-label={undo ? `Undo: ${undo}` : "Nothing to undo"}>
            ↶
          </button>
          <button type="button" className={`save-pill ${unsaved ? "pending" : "pass"}`} onClick={() => setPanel(panel === "save" ? "none" : "save")} aria-expanded={panel === "save"}>
            {unsaved ? "● Unsaved" : "✓ Saved"}
          </button>
        </div>

        <div className="bar-row vitals-row">
          <button type="button" className="mini" aria-label="Lose 1 HP" onClick={() => update("Take 1 damage", (d) => void applyDamage(d, sheet, 1))}>
            −1
          </button>
          <button type="button" className={`hp-btn ${sheet.bloodied ? "bloodied" : ""} ${sheet.dying ? "dying" : ""}`} onClick={() => setPanel("hp")} aria-label={`HP ${sheet.hp.current} of ${sheet.hp.max}. Change HP`}>
            <span className="hp-num">
              {sheet.hp.current}/{sheet.hp.max}
            </span>
            <span className="hp-label">{sheet.dead ? "Dead" : sheet.dying ? "Dying" : sheet.hp.temp ? `HP +${sheet.hp.temp}` : "HP"}</span>
            <span className="hp-track" aria-hidden="true">
              <span style={{ width: `${hpPct}%` }} />
            </span>
          </button>
          <button type="button" className="mini" aria-label="Heal 1 HP" onClick={() => update("Heal 1", (d) => void heal(d, sheet, 1))}>
            +1
          </button>
          <button type="button" className="vital vital-btn" onClick={() => setPanel("wounds")} aria-label={`Wounds ${sheet.wounds.current} of ${sheet.wounds.max}. Change Wounds`}>
            <span className="vital-label">Wounds</span>
            <span className={sheet.wounds.current > 0 ? "warn" : ""}>
              {sheet.wounds.current}/{sheet.wounds.max}
            </span>
          </button>
          <span className="vital" title={sheet.defense.parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
            <span className="vital-label">Defense</span>
            <span>{sheet.defense.value}</span>
          </span>
          {combat.active && (
            <span className="vital">
              <span className="vital-label">Actions</span>
              <span>{combat.actions}</span>
            </span>
          )}
        </div>

        {(sheet.resources.length > 0 || character.play.conditions.length > 0) && (
          <div className="bar-row chips">
            {sheet.resources.map((r) => (
              <span key={r.def.id} className="chip resource-chip">
                <button type="button" aria-label={`Spend 1 ${r.def.name}`} onClick={() => update(`${r.def.name} −1`, (d) => setResource(d, sheet, r.def.id, r.current - 1))}>
                  −
                </button>
                {r.def.name} {r.current}/{r.max}
                <button type="button" aria-label={`Regain 1 ${r.def.name}`} onClick={() => update(`${r.def.name} +1`, (d) => setResource(d, sheet, r.def.id, r.current + 1))}>
                  +
                </button>
              </span>
            ))}
            {character.play.conditions.length > 0 && (
              <span className="chip warn-chip" title="Conditions">
                {character.play.conditions.map((c) => content.conditions.get(c.id)?.name ?? c.id).join(", ")}
              </span>
            )}
          </div>
        )}

        {panel === "save" && (
          <div className="save-panel" role="region" aria-label="Saving">
            <p className="small">
              {unsaved ? "Changes since your last file save are only in this browser." : `Saved to a file ${timeAgo(entry.meta.lastSavedAt)}.`} Fingerprint <code>{entry.checksum ? fingerprint(entry.checksum) : "…"}</code>
            </p>
            <div className="row">
              <button type="button" className="primary" onClick={() => void save()}>
                Save character file
              </button>
              <button type="button" onClick={() => void library.endSession(id).then(() => setPanel("ended"))}>
                End session
              </button>
            </div>
            {unsaved && <p className="small">Ending a session without saving keeps everything in this browser only.</p>}
            {message && <p className="small">{message}</p>}
          </div>
        )}
        {panel === "ended" && <p className="save-panel small">Session ended{unsaved ? " (your latest changes aren't in a file yet)" : ""}. You can close Owlbear.</p>}

        <nav className="tabs" role="tablist" aria-label="Sheet sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "current" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {library.storageError && <p className="banner error">Couldn't save to this browser: {library.storageError}. Save your character file now.</p>}
      {sheet.warnings.map((w) => (
        <p key={w} className="banner error">
          {w}
        </p>
      ))}

      <div className="tab-body">
        {tab === "combat" && <CombatTab sheet={sheet} character={character} update={update} onRoll={setRoll} />}
        {tab === "character" && <CharacterTab sheet={sheet} character={character} update={update} onRoll={setRoll} />}
        {tab === "gear" && <GearTab sheet={sheet} character={character} update={update} />}
        {tab === "more" && (
          <MoreTab
            sheet={sheet}
            character={character}
            update={update}
            canLevelUp={levelUpPlan(content, character, sheet) !== null}
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
            onDelete={() => setPanel("delete")}
          />
        )}
      </div>

      {panel === "wounds" && <WoundsPanel sheet={sheet} update={update} onClose={() => setPanel("none")} />}
      {panel === "hp" && <HpPanel sheet={sheet} character={character} update={update} onClose={() => setPanel("none")} />}
      {deleteDialog}
      {roll && <RollDialog target={roll} character={character} sheet={sheet} onClose={() => setRoll(null)} />}
    </section>
  );
}
