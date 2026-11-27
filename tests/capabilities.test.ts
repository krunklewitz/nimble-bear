import { describe, expect, it } from "vitest";
import { checkIndexedDb, checkLocalStorage, readPickedFile, resultsAsText, runAutomaticChecks } from "../src/platform/capabilities";

describe("storage checks", () => {
  it("never throw, even where APIs are missing", async () => {
    const results = await runAutomaticChecks();
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(["pass", "fail", "info", "pending"]).toContain(r.status);
  });

  it("reports IndexedDB as failed when it doesn't exist (jsdom has none)", async () => {
    const [r] = await checkIndexedDb();
    expect(r?.status).toBe("fail");
  });

  it("detects working localStorage", () => {
    expect(checkLocalStorage().status).toBe("pass");
  });

  it("reads a picked file", async () => {
    const r = await readPickedFile(new File(['{"a":1}'], "x.json", { type: "application/json" }));
    expect(r.status).toBe("pass");
    expect(r.detail).toContain("7 characters");
  });

  it("formats results as plain text", () => {
    const text = resultsAsText([{ id: "a", label: "A", status: "pass", detail: "ok" }], "test");
    expect(text).toContain("PASS    A: ok");
  });
});
