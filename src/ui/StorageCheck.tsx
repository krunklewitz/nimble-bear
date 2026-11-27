import { useEffect, useRef, useState } from "react";
import {
  readPickedFile,
  resultsAsText,
  runAutomaticChecks,
  startTestDownload,
  tryClipboardRead,
  tryClipboardWrite,
  tryPopOut,
  trySaveDialog,
  type CheckResult,
} from "../platform/capabilities";
import { usePlatform } from "./PlatformContext";

const STATUS_LABEL: Record<CheckResult["status"], string> = {
  pass: "Works",
  fail: "Failed",
  info: "Info",
  pending: "Confirm",
};

export function StorageCheck({ onBack }: { onBack: () => void }) {
  const { platform } = usePlatform();
  const [results, setResults] = useState<CheckResult[]>([]);
  const [copied, setCopied] = useState<string>("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void runAutomaticChecks().then((r) => {
      if (!cancelled) setResults(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const upsert = (r: CheckResult) =>
    setResults((prev) => {
      const i = prev.findIndex((p) => p.id === r.id);
      if (i === -1) return [...prev, r];
      const next = [...prev];
      next[i] = r;
      return next;
    });

  const confirm = (id: string, worked: boolean) =>
    setResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: worked ? "pass" : "fail", detail: worked ? "Confirmed by you." : "You reported it didn't work." } : r)),
    );

  const context = platform.host === "owlbear" ? "inside Owlbear" : "normal browser tab";

  const copyResults = async () => {
    const text = resultsAsText(results, context);
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Results copied.");
    } catch {
      setCopied("Couldn't copy; select the text below instead.");
    }
  };

  return (
    <section className="screen" aria-labelledby="check-title">
      <button type="button" className="link" onClick={onBack}>
        ← Back
      </button>
      <h1 id="check-title">Storage check</h1>
      <p className="small">
        Running in: <strong>{context}</strong>. Click each test button below, then copy the results for the developer.
      </p>

      <div className="button-grid">
        <button type="button" onClick={() => upsert(startTestDownload())}>Test download</button>
        <button type="button" onClick={() => fileInput.current?.click()}>Test open file</button>
        <button type="button" onClick={() => void trySaveDialog().then(upsert)}>Test save dialog</button>
        <button type="button" onClick={() => void tryClipboardWrite().then(upsert)}>Test copy</button>
        <button type="button" onClick={() => void tryClipboardRead().then(upsert)}>Test paste</button>
        <button type="button" onClick={() => upsert(tryPopOut(window.location.href))}>Test pop-out</button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void readPickedFile(file).then(upsert);
          e.target.value = "";
        }}
      />

      <ul className="results" aria-live="polite">
        {results.map((r) => (
          <li key={r.id} className={`result ${r.status}`}>
            <span className="status">{STATUS_LABEL[r.status]}</span>
            <span className="label">{r.label}</span>
            <span className="detail">{r.detail}</span>
            {r.status === "pending" && (
              <span className="confirm">
                <button type="button" onClick={() => confirm(r.id, true)}>Yes</button>
                <button type="button" onClick={() => confirm(r.id, false)}>No</button>
              </span>
            )}
          </li>
        ))}
      </ul>

      <button type="button" className="primary" onClick={() => void copyResults()}>
        Copy results
      </button>
      {copied && <p className="small" role="status">{copied}</p>}
      <textarea className="results-text" readOnly value={resultsAsText(results, context)} aria-label="Results as text" />
    </section>
  );
}
