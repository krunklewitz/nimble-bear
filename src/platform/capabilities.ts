// Phase 1 spike: what file and storage features work where this page is running
// (inside Owlbear's iframe vs a normal tab). Results decide the Phase 2 save/load
// design and its fallbacks. Every check catches its own errors and never throws.

export type CheckStatus = "pass" | "fail" | "info" | "pending";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const DB_NAME = "nimble-bear-spike";
const STORE = "visits";

function errText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB.open failed"));
    req.onblocked = () => reject(new Error("indexedDB.open blocked"));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/** Writes this visit's time and reads back the previous one (proves data survives reloads). */
export async function checkIndexedDb(now: Date = new Date()): Promise<CheckResult[]> {
  const base = { id: "indexeddb", label: "IndexedDB write and read" };
  if (typeof indexedDB === "undefined") {
    return [{ ...base, status: "fail", detail: "indexedDB is not available here." }];
  }
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const previous = (await idbRequest(store.get("last"))) as string | undefined;
    await idbRequest(store.put(now.toISOString(), "last"));
    const readBack = (await idbRequest(store.get("last"))) as string | undefined;
    db.close();
    const ok = readBack === now.toISOString();
    return [
      { ...base, status: ok ? "pass" : "fail", detail: ok ? "Wrote and read a record." : "Read-back did not match." },
      {
        id: "indexeddb-survives",
        label: "IndexedDB kept data from an earlier visit",
        status: previous ? "pass" : "info",
        detail: previous
          ? `Previous visit recorded at ${new Date(previous).toLocaleString()}.`
          : "No earlier visit recorded yet. Reload or reopen this page, then check again.",
      },
    ];
  } catch (e) {
    return [{ ...base, status: "fail", detail: errText(e) }];
  }
}

export async function checkStoragePersistence(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!storage) {
    return [{ id: "persist", label: "Persistent storage", status: "fail", detail: "navigator.storage is not available." }];
  }
  try {
    const persisted = typeof storage.persisted === "function" ? await storage.persisted() : undefined;
    let granted: boolean | undefined;
    if (!persisted && typeof storage.persist === "function") granted = await storage.persist();
    const ok = persisted === true || granted === true;
    results.push({
      id: "persist",
      label: "Persistent storage (browser won't auto-clear)",
      status: ok ? "pass" : "info",
      detail: persisted ? "Already persistent." : granted ? "Granted on request." : "Not granted (data may be cleared under storage pressure).",
    });
  } catch (e) {
    results.push({ id: "persist", label: "Persistent storage", status: "fail", detail: errText(e) });
  }
  try {
    if (typeof storage.estimate === "function") {
      const est = await storage.estimate();
      const mb = (n: number | undefined) => (n === undefined ? "?" : `${(n / 1_048_576).toFixed(1)} MB`);
      results.push({ id: "quota", label: "Storage quota", status: "info", detail: `Using ${mb(est.usage)} of ${mb(est.quota)}.` });
    }
  } catch (e) {
    results.push({ id: "quota", label: "Storage quota", status: "fail", detail: errText(e) });
  }
  return results;
}

export function checkLocalStorage(): CheckResult {
  const base = { id: "localstorage", label: "localStorage" };
  try {
    localStorage.setItem("nimble-bear-spike", "1");
    const ok = localStorage.getItem("nimble-bear-spike") === "1";
    localStorage.removeItem("nimble-bear-spike");
    return { ...base, status: ok ? "pass" : "fail", detail: ok ? "Works." : "Read-back did not match." };
  } catch (e) {
    return { ...base, status: "fail", detail: errText(e) };
  }
}

export function checkEnvironment(): CheckResult[] {
  const results: CheckResult[] = [];
  const embedded = typeof window !== "undefined" && window.top !== window.self;
  results.push({
    id: "context",
    label: "Running inside an iframe",
    status: "info",
    detail: embedded ? "Yes (e.g. inside Owlbear)." : "No (a normal browser tab).",
  });
  results.push({
    id: "secure",
    label: "Secure context (HTTPS)",
    status: typeof isSecureContext !== "undefined" && isSecureContext ? "pass" : "fail",
    detail: typeof isSecureContext !== "undefined" && isSecureContext ? "Yes." : "No.",
  });
  results.push({
    id: "fs-access",
    label: "File System Access API (save dialog)",
    status: typeof window !== "undefined" && "showSaveFilePicker" in window ? "pass" : "info",
    detail: typeof window !== "undefined" && "showSaveFilePicker" in window ? "Available (not yet tried)." : "Not available; plain download is the save method.",
  });
  // Chrome exposes the iframe's allowed features (from Owlbear's iframe `allow` attribute).
  const policy = (document as Document & { featurePolicy?: { allowedFeatures(): string[] } }).featurePolicy;
  if (policy && typeof policy.allowedFeatures === "function") {
    try {
      const allowed = policy.allowedFeatures();
      const interesting = ["clipboard-write", "clipboard-read", "storage-access", "downloads"];
      results.push({
        id: "permissions-policy",
        label: "Iframe permissions",
        status: "info",
        detail: interesting.map((f) => `${f}: ${allowed.includes(f) ? "allowed" : "not listed"}`).join("; "),
      });
    } catch (e) {
      results.push({ id: "permissions-policy", label: "Iframe permissions", status: "fail", detail: errText(e) });
    }
  }
  return results;
}

/** Runs every check that needs no click. */
export async function runAutomaticChecks(): Promise<CheckResult[]> {
  const all: CheckResult[] = [...checkEnvironment(), checkLocalStorage()];
  all.push(...(await checkIndexedDb()));
  all.push(...(await checkStoragePersistence()));
  return all;
}

// ---- Checks that need a click (browsers require a user gesture) ----

export const SPIKE_FILE_CONTENT = JSON.stringify({ format: "nimble-bear/spike", note: "Test file from the Nimble Bear storage check." }, null, 2);

/** Starts a download. Success can't be detected by code; the user confirms. */
export function startTestDownload(): CheckResult {
  const base = { id: "download", label: "Download a file" };
  try {
    const blob = new Blob([SPIKE_FILE_CONTENT], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nimble-bear-test.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ...base, status: "pending", detail: "Download started. Did nimble-bear-test.json appear in your Downloads?" };
  } catch (e) {
    return { ...base, status: "fail", detail: errText(e) };
  }
}

/** Reads a file chosen with <input type=file>. */
export async function readPickedFile(file: File): Promise<CheckResult> {
  const base = { id: "picker", label: "Open a file (file picker)" };
  try {
    const text = await file.text();
    return { ...base, status: "pass", detail: `Read "${file.name}" (${text.length} characters).` };
  } catch (e) {
    return { ...base, status: "fail", detail: errText(e) };
  }
}

export async function tryClipboardWrite(): Promise<CheckResult> {
  const base = { id: "clipboard-write", label: "Copy to clipboard" };
  try {
    await navigator.clipboard.writeText(SPIKE_FILE_CONTENT);
    return { ...base, status: "pass", detail: "Copied test text." };
  } catch (e) {
    return { ...base, status: "fail", detail: errText(e) };
  }
}

export async function tryClipboardRead(): Promise<CheckResult> {
  const base = { id: "clipboard-read", label: "Paste from clipboard" };
  try {
    const text = await navigator.clipboard.readText();
    return { ...base, status: "pass", detail: `Read ${text.length} characters.` };
  } catch (e) {
    return { ...base, status: "fail", detail: errText(e) };
  }
}

export async function trySaveDialog(): Promise<CheckResult> {
  const base = { id: "fs-access-save", label: "Save dialog (File System Access API)" };
  const w = window as Window & { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }> };
  if (!w.showSaveFilePicker) return { ...base, status: "info", detail: "Not available in this browser context." };
  try {
    const handle = await w.showSaveFilePicker({ suggestedName: "nimble-bear-test.json" });
    const writable = await handle.createWritable();
    await writable.write(SPIKE_FILE_CONTENT);
    await writable.close();
    return { ...base, status: "pass", detail: "Saved through the save dialog." };
  } catch (e) {
    return { ...base, status: "fail", detail: errText(e) };
  }
}

export function tryPopOut(url: string): CheckResult {
  const base = { id: "popout", label: "Open pop-out window" };
  try {
    const win = window.open(url, "_blank", "noopener");
    // With noopener, window.open returns null even on success; the user confirms.
    return { ...base, status: "pending", detail: win === null ? "Requested. Did a new tab or window open?" : "Opened." };
  } catch (e) {
    return { ...base, status: "fail", detail: errText(e) };
  }
}

export function resultsAsText(results: CheckResult[], context: string): string {
  const lines = results.map((r) => `${r.status.toUpperCase().padEnd(7)} ${r.label}: ${r.detail}`);
  return [`Nimble Bear storage check (${context}) ${new Date().toISOString()}`, `User agent: ${navigator.userAgent}`, ...lines].join("\n");
}
