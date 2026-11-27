import { useRef, useState } from "react";
import { isUnsaved, type Entry } from "../app/library";
import { characterLevel } from "../rules/persistence/character";
import { downloadTextFile, readClipboardText, readFileText } from "../platform/files";
import { timeAgo } from "./format";
import { useLibrary } from "./LibraryContext";

interface Props {
  onOpen: (id: string) => void;
  onImportText: (text: string) => void;
  onRecover: () => void;
}

function Status({ entry }: { entry: Entry }) {
  if (entry.status === "broken") return <span className="badge fail">Can't open</span>;
  if (isUnsaved(entry)) return <span className="badge pending">Unsaved changes</span>;
  return <span className="badge pass">Saved {timeAgo(entry.meta.lastSavedAt)}</span>;
}

export function CharacterList({ onOpen, onImportText, onRecover }: Props) {
  const { library } = useLibrary();
  const fileInput = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [message, setMessage] = useState("");
  const entries = library.list();

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = await library.create(name);
    setNewName("");
    onOpen(id);
  };

  return (
    <section className="screen" aria-labelledby="list-title">
      <h1 id="list-title">Characters</h1>

      {entries.length === 0 ? (
        <p className="small">No characters on this computer yet. Make a test character, or load a character file.</p>
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

      <form
        className="row"
        onSubmit={(ev) => {
          ev.preventDefault();
          void create();
        }}
      >
        <label className="grow">
          <span className="sr-only">New character name</span>
          <input value={newName} onChange={(ev) => setNewName(ev.target.value)} placeholder="Name for a test character" maxLength={80} />
        </label>
        <button type="submit" disabled={!newName.trim()}>
          Create
        </button>
      </form>

      <div className="button-grid">
        <button type="button" className="primary" onClick={() => fileInput.current?.click()}>
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
