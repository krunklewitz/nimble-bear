import { describe, expect, it } from "vitest";
import { ATTRIBUTION, FREE_APP_NOTICE } from "../src/ui/legalText";

// Exact wording from the Nimble 3rd Party Creator License v2.0 (nimbleRPG.com/pages/creators).
describe("license text", () => {
  it("uses the exact required free-app notice", () => {
    expect(FREE_APP_NOTICE).toBe(
      "This app is free to use for anyone who already owns the content, is trying the system out, or cannot afford to buy it right now. If you enjoy Nimble and are able, please support the game by purchasing the official content at nimbleRPG.com.",
    );
  });

  it("uses the exact required attribution", () => {
    expect(ATTRIBUTION).toBe(
      "Nimble Bear is an independent product published under the Nimble 3rd Party Creator License. Nimble © Nimble Co.",
    );
  });
});
