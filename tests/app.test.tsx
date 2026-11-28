import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMockPlatform } from "../src/platform/mock";
import { createMemoryStore } from "../src/platform/storage/memory";
import type { CharacterStore } from "../src/platform/storage/types";
import { App } from "../src/ui/App";
import { LibraryProvider } from "../src/ui/LibraryContext";
import { FREE_APP_NOTICE } from "../src/ui/legalText";
import { PlatformProvider } from "../src/ui/PlatformContext";

const hpButton = (hp: number, max: number) => screen.getByRole("button", { name: `HP ${hp} of ${max}. Change HP` });

function renderApp(store: CharacterStore = createMemoryStore()) {
  return render(
    <PlatformProvider platform={createMockPlatform()}>
      <LibraryProvider version="0.2.0" store={store}>
        <App version="0.2.0" />
      </LibraryProvider>
    </PlatformProvider>,
  );
}

describe("App", () => {
  beforeAll(() => {
    // jsdom has no object URLs; downloads are exercised in the real browser.
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
  });
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("shows the required notice on first open", async () => {
    renderApp();
    expect(await screen.findByText(FREE_APP_NOTICE)).toBeTruthy();
  });

  it("goes to the character list after Continue, keeps a license link, and skips welcome next time", async () => {
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Characters" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /About & license/ })).toBeTruthy();
    cleanup();
    renderApp();
    expect(await screen.findByRole("heading", { name: "Characters" })).toBeTruthy();
  });

  it("About shows the notice and attribution", async () => {
    localStorage.setItem("nimble-bear:welcome-seen", "1");
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: /About & license/ }));
    expect(screen.getByText(FREE_APP_NOTICE)).toBeTruthy();
    expect(screen.getByText(/independent product published under the Nimble 3rd Party Creator License/)).toBeTruthy();
  });

  async function createGrace(store = createMemoryStore()) {
    localStorage.setItem("nimble-bear:welcome-seen", "1");
    renderApp(store);
    fireEvent.click(await screen.findByRole("button", { name: "+ New hero" }));
    const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("radio", { name: /^Shepherd/ }));
    next();
    fireEvent.click(screen.getByRole("radio", { name: /^Human/ }));
    next();
    fireEvent.click(screen.getByRole("radio", { name: /^Wild One/ }));
    next();
    fireEvent.click(screen.getByRole("radio", { name: /^Standard/ }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Add a point to Influence" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a point to Influence" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a point to Insight" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a point to Perception" }));
    next();
    next(); // languages (INT -1: none)
    next(); // class gear
    fireEvent.change(screen.getByLabelText("Hero name"), { target: { value: "Grace" } });
    fireEvent.click(screen.getByRole("button", { name: "Create hero" }));
    return store;
  }

  it("creates the book's quick-build Shepherd through the wizard", async () => {
    const store = await createGrace();
    expect(await screen.findByRole("heading", { name: /^Grace/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Grace Shepherd 1/ })).toBeTruthy();
    expect(hpButton(17, 17)).toBeTruthy();
    const defense = screen.getByText("Defense").parentElement;
    expect(defense?.textContent).toContain("8");
    await vi.waitFor(async () => expect((await store.listCharacters()).length).toBe(1));
  });

  it("autosaves damage and marks the hero saved after saving a file", async () => {
    const store = await createGrace();
    await screen.findByRole("heading", { name: /^Grace/ });
    fireEvent.click(hpButton(17, 17));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Damage" }));
    expect(screen.getByText("Lost 5 HP.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(hpButton(12, 17)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lose 1 HP" }));
    expect(hpButton(11, 17)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo: Take 1 damage" }));
    await vi.waitFor(async () => {
      const [record] = await store.listCharacters();
      expect((record?.character as { play: { hp: number } }).play.hp).toBe(12);
    });
    fireEvent.click(screen.getByRole("button", { name: /Undo: Take 5 damage/ }));
    expect(hpButton(17, 17)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "● Unsaved" }));
    fireEvent.click(screen.getByRole("button", { name: "Save character file" }));
    expect(await screen.findByRole("button", { name: "✓ Saved" })).toBeTruthy();
  });

  it("adjusts Wounds by hand from the top bar", async () => {
    await createGrace();
    await screen.findByRole("heading", { name: /^Grace/ });
    fireEvent.click(screen.getByRole("button", { name: "Wounds 0 of 6. Change Wounds" }));
    fireEvent.click(screen.getByRole("button", { name: "Gain a Wound" }));
    fireEvent.click(screen.getByRole("button", { name: "Gain a Wound" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove a Wound" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Wounds 1 of 6. Change Wounds" })).toBeTruthy();
  });

  it("labels feature groups by where they come from", async () => {
    await createGrace();
    await screen.findByRole("heading", { name: /^Grace/ });
    fireEvent.click(screen.getByRole("tab", { name: "Character" }));
    expect(screen.getByText("Class Features (Shepherd)")).toBeTruthy();
    expect(screen.getByText("Ancestry (Human)")).toBeTruthy();
    expect(screen.getByText("Background (Wild One)")).toBeTruthy();
    expect(screen.queryByText(/^Subclass Features/)).toBeNull(); // no subclass before level 3
  });

  it("reopens on the last open hero", async () => {
    const store = await createGrace();
    await screen.findByRole("heading", { name: /^Grace/ });
    cleanup();
    renderApp(store);
    expect(await screen.findByRole("heading", { name: /^Grace/ })).toBeTruthy();
  });

  it("explains an invalid pasted file and changes nothing", async () => {
    localStorage.setItem("nimble-bear:welcome-seen", "1");
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Paste character file" }));
    fireEvent.change(screen.getByLabelText(/Paste the character file text here/), { target: { value: "not a file" } });
    fireEvent.click(screen.getByRole("button", { name: "Load pasted text" }));
    expect(await screen.findByText("Couldn't load that file")).toBeTruthy();
    expect(screen.getByText(/Nothing on this computer was changed/)).toBeTruthy();
  });
});
