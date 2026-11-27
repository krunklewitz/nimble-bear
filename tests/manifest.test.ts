import { describe, expect, it } from "vitest";
import { buildManifest, DEV_SITE_URL, PROD_SITE_URL } from "../manifest.config";

describe("Owlbear manifest", () => {
  const m = buildManifest(PROD_SITE_URL, "0.1.0");

  it("respects documented length limits", () => {
    expect(m.name.length).toBeLessThanOrEqual(45);
    expect(m.description.length).toBeLessThanOrEqual(128);
  });

  it("uses manifest_version 1 and the 400x600 popover", () => {
    expect(m.manifest_version).toBe(1);
    expect(m.action.width).toBe(400);
    expect(m.action.height).toBe(600);
  });

  it("points every URL inside the GitHub Pages site", () => {
    for (const url of [m.icon, m.action.icon, m.action.popover, m.homepage_url]) {
      expect(url.startsWith("https://krunklewitz.github.io/nimble-bear/")).toBe(true);
    }
  });

  it("adds a trailing slash when the site URL lacks one", () => {
    expect(buildManifest("http://localhost:5173", "1").action.popover).toBe(`${DEV_SITE_URL}index.html`);
  });

  it("only requests permissions the docs allow", () => {
    const allowed = ["clipboard-write", "clipboard-read", "autoplay", "bluetooth", "camera", "microphone", "usb", "display-capture", "hid"];
    for (const p of m.permissions) expect(allowed).toContain(p.name);
  });

  it("does not claim to be official", () => {
    expect(m.description).toMatch(/Unofficial/);
    expect(m.description).toMatch(/Not affiliated with Nimble Co\./);
  });
});
