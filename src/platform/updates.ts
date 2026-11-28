// Detects a newer deployed version. GitHub Pages caches index.html for 10 minutes
// (Cache-Control: max-age=600), so an open or reopened popover can keep running old code.
// We fetch manifest.json with a cache-busting query and compare versions.

/** True when `latest` is a higher dotted version than `current` (e.g. 0.3.10 > 0.3.9). */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const b = current.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The deployed version, or null when it can't be read (offline, dev server). */
export async function fetchLatestVersion(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const url = new URL("manifest.json", document.baseURI);
    url.searchParams.set("t", String(Date.now()));
    const res = await fetcher(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

/** Reloads at a URL the browser hasn't cached (adds ?v=<version>). */
export function reloadToVersion(version: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("v", version);
  window.location.replace(url.toString());
}
