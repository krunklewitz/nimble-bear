// File, clipboard and hashing helpers. Download, file picker and clipboard all work
// inside Owlbear in Chrome (Phase 1 spike); the save dialog does not, so it isn't used.

export function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const readFileText = (file: File): Promise<string> => file.text();

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function readClipboardText(): Promise<string> {
  return navigator.clipboard.readText();
}

/** SHA-256 as lowercase hex (Web Crypto). */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Local calendar date as YYYY-MM-DD, for file names. */
export function localDateStamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newId(): string {
  return crypto.randomUUID();
}
