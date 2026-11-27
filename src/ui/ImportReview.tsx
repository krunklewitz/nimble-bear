import { useEffect, useRef, useState } from "react";
import type { ImportChoice, ImportPlan, ImportResult } from "../app/library";
import { characterLevel, type Character } from "../rules/persistence/character";
import { fingerprint } from "../rules/persistence/canonical";
import { CONFLICT_TEXT } from "../rules/persistence/loadDecision";
import { dateTime } from "./format";
import { useLibrary } from "./LibraryContext";

interface Props {
  plan: ImportPlan;
  onDone: (id: string | null) => void;
  onCancel: () => void;
}

function Row({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr className={a === b ? "" : "differs"}>
      <th scope="row">{label}</th>
      <td>{a}</td>
      <td>{b}</td>
    </tr>
  );
}

function summary(c: Character) {
  return {
    name: c.name,
    level: String(characterLevel(c)),
    hp: `${c.play.hp} HP, ${c.play.wounds} Wounds`,
    changes: String(c.revision),
    changed: dateTime(c.updatedAt),
  };
}

export function ImportReview({ plan, onDone, onCancel }: Props) {
  const { library } = useLibrary();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);

  // Safe loads (new character, or a newer file with no local changes) apply at once,
  // unless the file looks edited or damaged.
  const safe = (plan.kind === "new" || plan.kind === "replace" || plan.kind === "same") && plan.parsed.checksumMatches;

  const apply = async (choice: ImportChoice) => {
    setBusy(true);
    try {
      setResult(await library.applyImport(plan, choice));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (safe && !started.current) {
      started.current = true;
      void apply("useFile");
    }
    // apply is stable enough for a one-time run; guarded by `started`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safe]);

  if (plan.kind === "invalid") {
    return (
      <section className="screen">
        <h1>Couldn't load that file</h1>
        <p className="banner error" role="alert">{plan.error}</p>
        <p className="small">Nothing on this computer was changed, and your file is untouched.</p>
        <button type="button" onClick={onCancel}>Back</button>
      </section>
    );
  }

  const { parsed } = plan;

  if (result) {
    return (
      <section className="screen">
        <h1>{result.id ? "Loaded" : "Kept this computer's copy"}</h1>
        {plan.kind === "same" && <p>This computer already has exactly this version of {parsed.character.name}.</p>}
        {result.exact === true && (
          <p className="banner pass" role="status">
            ✓ Restored exactly: the copy stored on this computer matches the file (fingerprint <code>{fingerprint(parsed.checksum)}</code>).
          </p>
        )}
        {result.exact === false && (
          <p className="banner error" role="alert">
            The stored copy doesn't match the file. Keep your file safe and report this.
          </p>
        )}
        {parsed.migratedFrom !== null && (
          <p className="small">This file was made by an older version and was upgraded. Save a new character file to keep the upgraded copy.</p>
        )}
        <button type="button" className="primary" onClick={() => onDone(result.id)}>
          {result.id ? "Open character" : "Back"}
        </button>
      </section>
    );
  }

  if (safe || busy) return <p className="screen" role="status">Loading…</p>;

  const incoming = summary(parsed.character);
  const local = plan.kind === "conflict" || plan.local ? summary(plan.kind === "conflict" ? plan.local : (plan.local as Character)) : null;

  return (
    <section className="screen" aria-labelledby="import-title">
      <h1 id="import-title">Check before loading</h1>
      {!parsed.checksumMatches && (
        <p className="banner error" role="alert">
          This file's contents don't match its checksum: it may have been edited by hand or damaged.
        </p>
      )}
      {plan.kind === "conflict" && <p>{CONFLICT_TEXT[plan.reason]} Choose which copy to keep.</p>}

      {local ? (
        <table className="compare">
          <thead>
            <tr>
              <th />
              <th scope="col">On this computer</th>
              <th scope="col">In the file</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Name" a={local.name} b={incoming.name} />
            <Row label="Level" a={local.level} b={incoming.level} />
            <Row label="Health" a={local.hp} b={incoming.hp} />
            <Row label="Changes made" a={local.changes} b={incoming.changes} />
            <Row label="Last changed" a={local.changed} b={incoming.changed} />
          </tbody>
        </table>
      ) : (
        <p>
          Load <strong>{incoming.name}</strong> (level {incoming.level}) anyway?
        </p>
      )}
      {parsed.savedAt && <p className="small">File saved {dateTime(parsed.savedAt)}.</p>}

      <div className="stack">
        {plan.kind === "conflict" ? (
          <>
            <button type="button" onClick={() => void apply("keepLocal")}>Keep this computer's copy</button>
            <button type="button" onClick={() => void apply("useFile")}>Use the file (a snapshot of this computer's copy is kept)</button>
            <button type="button" className="primary" onClick={() => void apply("keepBoth")}>Keep both (load the file as a copy)</button>
          </>
        ) : (
          <>
            <button type="button" className="primary" onClick={() => void apply("useFile")}>Load it</button>
            <button type="button" onClick={onCancel}>Cancel</button>
          </>
        )}
      </div>
      {error && <p className="banner error" role="alert">{error}</p>}
    </section>
  );
}
