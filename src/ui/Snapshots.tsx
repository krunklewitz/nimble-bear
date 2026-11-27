import { useEffect, useState } from "react";
import type { SnapshotRecord } from "../platform/storage/types";
import { dateTime, SNAPSHOT_REASON } from "./format";
import { useLibrary } from "./LibraryContext";

interface Props {
  /** One character's snapshots, or (undefined) every snapshot incl. deleted characters. */
  characterId?: string;
  onBack: () => void;
  onRestored: (id: string) => void;
}

export function Snapshots({ characterId, onBack, onRestored }: Props) {
  const { library } = useLibrary();
  const [snaps, setSnaps] = useState<SnapshotRecord[] | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void library.listSnapshots(characterId).then((s) => {
      if (!cancelled) setSnaps(s);
    });
    return () => {
      cancelled = true;
    };
  }, [library, characterId]);

  const restore = async (id: number) => {
    const r = await library.restoreSnapshot(id);
    if (r.ok) onRestored(r.id);
    else setError(r.error);
  };

  return (
    <section className="screen" aria-labelledby="snap-title">
      <button type="button" className="link" onClick={onBack}>
        ← Back
      </button>
      <h1 id="snap-title">Snapshots</h1>
      <p className="small">
        Nimble Bear keeps a copy before loading a file, restoring, deleting, levelling up, or an app update. Restoring also keeps a snapshot of the current copy first.
      </p>
      {snaps === null && <p role="status">Loading…</p>}
      {snaps?.length === 0 && <p>No snapshots yet.</p>}
      <ul className="char-list">
        {snaps?.map((s) => {
          const deleted = !library.get(s.characterId);
          return (
            <li key={s.id} className="panel">
              <strong>{s.characterName}</strong> {deleted && <span className="badge fail">Deleted</span>}
              <div className="small">
                {SNAPSHOT_REASON[s.reason]} · {dateTime(s.takenAt)}
              </div>
              {confirmId === s.id ? (
                <div className="row">
                  <span className="small">Replace the current copy with this snapshot?</span>
                  <button type="button" className="primary" onClick={() => void restore(s.id as number)}>
                    Restore
                  </button>
                  <button type="button" className="link" onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmId(s.id ?? null)}>
                  {deleted ? "Bring back" : "Restore"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="banner error" role="alert">{error}</p>}
    </section>
  );
}
