import { describe, expect, it, vi } from "vitest";
import { fetchLatestVersion, isNewer } from "../src/platform/updates";

describe("update check", () => {
  it("compares dotted versions numerically", () => {
    expect(isNewer("0.3.10", "0.3.9")).toBe(true);
    expect(isNewer("0.4.0", "0.3.9")).toBe(true);
    expect(isNewer("0.3.4", "0.3.4")).toBe(false);
    expect(isNewer("0.3.3", "0.3.4")).toBe(false);
    expect(isNewer("1.0", "0.9.9")).toBe(true);
  });

  it("reads the version from manifest.json without the cache", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ version: "0.3.5" }), { status: 200 }));
    expect(await fetchLatestVersion(fetcher as unknown as typeof fetch)).toBe("0.3.5");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/manifest\.json\?t=\d+/);
    expect(init.cache).toBe("no-store");
  });

  it("returns null when offline or the file is bad", async () => {
    expect(await fetchLatestVersion((async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBeNull();
    expect(await fetchLatestVersion((async () => new Response("nope", { status: 404 })) as unknown as typeof fetch)).toBeNull();
  });
});
