import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMockPlatform } from "../src/platform/mock";
import { App } from "../src/ui/App";
import { FREE_APP_NOTICE } from "../src/ui/legalText";
import { PlatformProvider } from "../src/ui/PlatformContext";

function renderApp(role: "GM" | "PLAYER" = "PLAYER") {
  return render(
    <PlatformProvider platform={createMockPlatform({ role })}>
      <App version="0.1.0" />
    </PlatformProvider>,
  );
}

describe("App", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("shows the required notice on first open", async () => {
    renderApp();
    expect(await screen.findByText(FREE_APP_NOTICE)).toBeTruthy();
  });

  it("goes home after Continue, keeps a license link, and skips welcome next time", async () => {
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Nimble Bear" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /About & license/ })).toBeTruthy();
    cleanup();
    renderApp();
    expect(await screen.findByRole("heading", { name: "Nimble Bear" })).toBeTruthy();
  });

  it("About shows the notice and attribution", async () => {
    localStorage.setItem("nimble-bear:welcome-seen", "1");
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: /About & license/ }));
    expect(screen.getByText(FREE_APP_NOTICE)).toBeTruthy();
    expect(screen.getByText(/independent product published under the Nimble 3rd Party Creator License/)).toBeTruthy();
  });

  it("shows the GM view to a GM", async () => {
    localStorage.setItem("nimble-bear:welcome-seen", "1");
    renderApp("GM");
    expect(await screen.findByText(/GM view\./)).toBeTruthy();
  });
});
