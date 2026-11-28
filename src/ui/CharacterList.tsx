import { useRef, useState } from "react";
import { isUnsaved, type Entry } from "../app/library";
import { characterLevel } from "../rules/persistence/character";
import { downloadTextFile, readClipboardText, readFileText } from "../platform/files";
import { timeAgo } from "./format";
import { useLibrary } from "./LibraryContext";

interface Props {
  onOpen: (id: string) => void;
  onCreate: () => void;
  onImportText: (text: string) => void;
  onRecover: () => void;
  /** Shown to the GM (and in a normal browser tab, for testing). */
  onGm?: (() => void) | undefined;
}

function Status({ entry }: { entry: Entry }) {
  if (entry.status === "broken") return <span className="badge fail">Can't open</span>;
  if (isUnsaved(entry)) return <span className="badge pending">Unsaved changes</span>;
  return <span className="badge pass">Saved {timeAgo(entry.meta.lastSavedAt)}</span>;
}

export function CharacterList({ onOpen, onCreate, onImportText, onRecover, onGm }: Props) {
  const { library } = useLibrary();
  const fileInput = useRef<HTMLInputElement>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [message, setMessage] = useState("");
  const entries = library.list();

  return (
    <section className="screen" aria-labelledby="list-title">
      <h1 id="list-title">Characters</h1>
      {onGm && (
        <button type="button" className="wide gm-entry" onClick={onGm}>
          GM tools: encounters and combat tracker
        </button>
      )}

      {entries.length === 0 ? (
        <p className="small">No characters on this computer yet. Make a new hero, or load a character file.</p>
      ) : (
        <ul className="char-list">
          {entries.map((e) => (
            <li key={e.id}>
              {e.status === "ok" ? (
                <button type="button" className="char-row" onClick={() => onOpen(e.id)}>
                  <span className="char-name">{e.character.name}</span>
                  <span className="small">Level {characterLevel(e.character)}</span>
                  <Status entry={e} />
                </button>
              ) : (
                <div className="char-row broken">
                  <span className="char-name">{e.name}</span>
                  <Status entry={e} />
                  <span className="small">{e.error}</span>
                  <button type="button" onClick={() => downloadTextFile(`${e.name}-raw-backup.json`, JSON.stringify(e.record, null, 2))}>
                    Download raw backup
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="primary wide" onClick={onCreate}>
        + New hero
      </button>

      <div className="button-grid">
        <button type="button" onClick={() => fileInput.current?.click()}>
          Load character file
        </button>
        <button type="button" onClick={() => setShowPaste((v) => !v)}>
          Paste character file
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          ev.target.value = "";
          if (file) void readFileText(file).then(onImportText);
        }}
      />

      {showPaste && (
        <div className="panel">
          <label>
            Paste the character file text here
            <textarea className="results-text" value={pasteText} onChange={(ev) => setPasteText(ev.target.value)} />
          </label>
          <div className="row">
            <button
              type="button"
              onClick={() =>
                void readClipboardText()
                  .then(setPasteText)
                  .catch(() => setMessage("Couldn't read the clipboard; paste with Ctrl+V instead."))
              }
            >
              Paste from clipboard
            </button>
            <button type="button" className="primary" disabled={!pasteText.trim()} onClick={() => onImportText(pasteText)}>
              Load pasted text
            </button>
          </div>
          {message && <p className="small" role="status">{message}</p>}
        </div>
      )}

      <p>
        <button type="button" className="link" onClick={onRecover}>
          Snapshots and deleted characters
        </button>
      </p>
    </section>
  );
}
