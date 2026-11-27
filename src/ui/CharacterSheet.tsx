import { useState } from "react";
import { isUnsaved } from "../app/library";
import { characterLevel, type Character } from "../rules/persistence/character";
import { fingerprint } from "../rules/persistence/canonical";
import { copyText, downloadTextFile } from "../platform/files";
import { timeAgo } from "./format";
import { useLibrary } from "./LibraryContext";
import { usePlatform } from "./PlatformContext";

interface Props {
  id: string;
  onBack: () => void;
  onSnapshots: (id: string) => void;
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (n: number) => void }) {
  const clamp = (n: number) => (min !== undefined ? Math.max(min, n) : n);
  return (
    <div className="num-field">
      <span className="num-label">{label}</span>
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - 1))}>
        −
      </button>
      <input
        type="number"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
      />
      <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + 1))}>
        +
      </button>
    </div>
  );
}

/** Saves every keystroke, except while the box is empty (a name is required). */
function NameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  return (
    <label className="field">
      Name
      <input
        value={draft}
        maxLength={80}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value.trim()) onCommit(e.target.value.trim());
        }}
        onBlur={() => setDraft(name)}
        aria-invalid={!draft.trim()}
      />
    </label>
  );
}

export function CharacterSheet({ id, onBack, onSnapshots }: Props) {
  const { library } = useLibrary();
  const { platform } = usePlatform();
  const [dialog, setDialog] = useState<"none" | "end" | "delete" | "ended">("none");
  const [message, setMessage] = useState("");
  const entry = library.get(id);

  if (entry?.status !== "ok") {
    return (
      <section className="screen">
        <p>This character isn't on this computer.</p>
        <button type="button" onClick={onBack}>Back to characters</button>
      </section>
    );
  }

  const c = entry.character;
  const unsaved = isUnsaved(entry);
  const set = (change: (draft: Character) => void) => library.update(id, change);

  const save = async () => {
    const { fileName, text } = await library.saveToFile(id);
    downloadTextFile(fileName, text);
    setMessage(`Saved ${fileName} to your Downloads folder.`);
    void platform.notify(`Saved ${fileName}`, "SUCCESS");
  };

  const copy = async () => {
    try {
      await copyText(await library.fileText(id));
      setMessage("Copied the character file as text. Paste it somewhere safe; this doesn't replace saving a file.");
    } catch {
      setMessage("Couldn't copy to the clipboard.");
    }
  };

  return (
    <section className="screen" aria-labelledby="sheet-title">
      <button type="button" className="link" onClick={onBack}>
        ← Characters
      </button>
      <h1 id="sheet-title">{c.name}</h1>

      <div className={`save-status ${unsaved ? "pending" : "pass"}`} role="status">
        {unsaved ? (
          <strong>● Unsaved changes since the last file save</strong>
        ) : (
          <strong>✓ Saved to file {timeAgo(entry.meta.lastSavedAt)}</strong>
        )}
        <span className="small">
          Last file save: {entry.meta.lastSavedAt ? new Date(entry.meta.lastSavedAt).toLocaleString() : "never"} · Fingerprint{" "}
          <code>{entry.checksum ? fingerprint(entry.checksum) : "…"}</code>
        </span>
      </div>

      <div className="button-grid">
        <button type="button" className="primary" onClick={() => void save()}>
          Save character file
        </button>
        <button type="button" onClick={() => setDialog("end")}>
          End session
        </button>
      </div>
      {message && <p className="small" role="status">{message}</p>}

      {dialog === "end" && (
        <div className="panel" role="dialog" aria-label="End session">
          <h2>End session</h2>
          {unsaved ? (
            <p>You have changes that aren't in a character file yet. Save one now so your character is safe on any computer.</p>
          ) : (
            <p>Your character file is up to date.</p>
          )}
          <div className="row">
            {unsaved && (
              <button type="button" className="primary" onClick={() => void save()}>
                Save character file
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                void library.endSession(id).then(() => {
                  setDialog("ended");
                })
              }
            >
              {unsaved ? "End without saving a file" : "End session"}
            </button>
            <button type="button" className="link" onClick={() => setDialog("none")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {dialog === "ended" && (
        <p className="panel" role="status">
          Session ended. Everything is stored on this computer{isUnsaved(entry) ? ", but your latest changes aren't in a file yet" : " and in your saved file"}. You can close Owlbear.
        </p>
      )}

      <h2>Test fields</h2>
      <p className="small">Stand-ins so you can test saving. The real sheet arrives in Phase 3.</p>
      <NameField name={c.name} onCommit={(name) => set((d) => void (d.name = name))} />
      <p className="small">Level {characterLevel(c)}</p>
      <NumberField label="HP" value={c.play.hp} onChange={(n) => set((d) => void (d.play.hp = n))} />
      <NumberField label="Temp HP" value={c.play.tempHp} min={0} onChange={(n) => set((d) => void (d.play.tempHp = n))} />
      <NumberField label="Wounds" value={c.play.wounds} min={0} onChange={(n) => set((d) => void (d.play.wounds = n))} />
      <NumberField label="Gold" value={c.play.gold} min={0} onChange={(n) => set((d) => void (d.play.gold = n))} />
      <label className="field">
        Notes
        <textarea value={c.play.notes} onChange={(e) => set((d) => void (d.play.notes = e.target.value))} rows={4} />
      </label>

      <h2>More</h2>
      <div className="button-grid">
        <button type="button" onClick={() => void copy()}>
          Copy as text
        </button>
        <button type="button" onClick={() => onSnapshots(id)}>
          Snapshots
        </button>
        <button type="button" className="danger" onClick={() => setDialog("delete")}>
          Remove from this computer
        </button>
      </div>
      {dialog === "delete" && (
        <div className="panel" role="dialog" aria-label="Remove character">
          <p>
            Remove <strong>{c.name}</strong> from this computer? A snapshot is kept, so you can bring it back from "Snapshots and deleted characters". Your saved files aren't touched.
          </p>
          <div className="row">
            <button
              type="button"
              className="danger"
              onClick={() =>
                void library.deleteCharacter(id).then(() => {
                  onBack();
                })
              }
            >
              Remove
            </button>
            <button type="button" className="link" onClick={() => setDialog("none")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {library.storageError && (
        <p className="banner error" role="alert">
          Couldn't save to this browser: {library.storageError}. Save your character file now.
        </p>
      )}
    </section>
  );
}
