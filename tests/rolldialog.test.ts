// The roll window's cost line (shown before rolling, and for abilities with nothing to roll).
import { describe, expect, it } from "vitest";
import type { Sheet, SheetAction } from "../src/rules/derive";
import { costText } from "../src/ui/RollDialog";

const sheet = { resources: [{ def: { id: "resource.zephyr.burst-of-speed", name: "Bursts of Speed" }, max: 2, current: 1 }] } as unknown as Sheet;
const action = (a: Partial<SheetAction>): SheetAction => ({ id: "x", name: "X", kind: "ability", actions: undefined, text: "", sourceId: "s", ...a });

describe("costText", () => {
  it("names actions, mana, resources and uses left", () => {
    expect(costText(sheet, action({ actions: 1, manaCost: 2 }))).toBe("1 action · 2 mana");
    expect(costText(sheet, action({ resourceCost: { id: "resource.zephyr.burst-of-speed", amount: 1 } }))).toBe("1 Bursts of Speed (1 left)");
    expect(costText(sheet, action({ actions: 2, limit: { max: 2, per: "encounter", used: 1 } }))).toBe("2 actions · 1 of 2 uses left (per encounter)");
  });
  it("upcast mana overrides the base cost", () => {
    expect(costText(sheet, action({ manaCost: 1 }), 3)).toBe("3 mana");
  });
});
