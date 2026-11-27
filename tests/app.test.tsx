import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMockPlatform } from "../src/platform/mock";
import { createMemoryStore } from "../src/platform/storage/memory";
import type { CharacterStore } from "../src/platform/storage/types";
import { App } from "../src/ui/App";
import { LibraryProvider } from "../src/ui/LibraryContext";
import { FREE_APP_NOTICE } from "../src/ui/legalText";
import { PlatformProvider } from "../src/ui/PlatformContext";

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

  it("creates a character, autosaves edits, and marks it saved after saving a file", async () => {
    localStorage.setItem("nimble-bear:welcome-seen", "1");
    const store = createMemoryStore();
    renderApp(store);
    fireEvent.change(await screen.findByPlaceholderText("Name for a test character"), { target: { value: "Brakka" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("heading", { name: "Brakka" })).toBeTruthy();
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Increase HP" }));
    await vi.waitFor(async () => {
      const [record] = await store.listCharacters();
      expect((record?.character as { play: { hp: number } }).play.hp).toBe(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Save character file" }));
    expect(await screen.findByText(/Saved to file just now/)).toBeTruthy();
    expect(screen.getByText(/Brakka_L1_.*\.nimble\.json/)).toBeTruthy();
  });

  it("reopens on the last open character", async () => {
    localStorage.setItem("nimble-bear:welcome-seen", "1");
    const store = createMemoryStore();
    renderApp(store);
    fireEvent.change(await screen.findByPlaceholderText("Name for a test character"), { target: { value: "Brakka" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByRole("heading", { name: "Brakka" });
    cleanup();
    renderApp(store);
    expect(await screen.findByRole("heading", { name: "Brakka" })).toBeTruthy();
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
