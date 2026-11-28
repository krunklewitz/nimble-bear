import { describe, expect, it } from "vitest";
import { difficultyOf, encounterCost, encounterWarnings, monsterBudget, parseLevel, suggestedMinionDice } from "../../src/rules/encounter";

describe("encounter budget (GMG p.22–23)", () => {
  it("the budget is the heroes' total level (3 level 2 heroes → 6)", () => {
    expect(monsterBudget([2, 2, 2])).toBe(6);
  });

  it("the book's example: 6 level-4 griffons are Hard for 6 level 4, 4 level 6 or 3 level 8 heroes", () => {
    const flock = [{ level: "4", minion: false, count: 6 }];
    for (const party of [[4, 4, 4, 4, 4, 4], [6, 6, 6, 6], [8, 8, 8]]) {
      const r = difficultyOf(encounterCost(flock, party), monsterBudget(party));
      expect(r.difficulty.label).toBe("Hard");
      expect(r.percent).toBe(100);
    }
  });

  it("bands: 50% Easy, 75% Medium, 125% Deadly, 150% Very Deadly; under 50% still Easy", () => {
    expect(difficultyOf(4, 8).difficulty.label).toBe("Easy");
    expect(difficultyOf(6, 8).difficulty.label).toBe("Medium");
    expect(difficultyOf(10, 8).difficulty.label).toBe("Deadly");
    expect(difficultyOf(12, 8).difficulty.label).toBe("Very Deadly");
    expect(difficultyOf(1, 8).difficulty.label).toBe("Easy");
  });

  it("fractional levels: two level-1/2 goblins cost 1", () => {
    expect(parseLevel("1/2")).toBe(0.5);
    expect(parseLevel("1/3")).toBeCloseTo(1 / 3);
    expect(Number.isNaN(parseLevel("x"))).toBe(true);
    expect(encounterCost([{ level: "1/2", minion: false, count: 2 }], [1])).toBe(1);
  });

  it("minions: 2 per hero count as 1 monster of the heroes' level (RQ-030)", () => {
    const party = [3, 3, 3, 3];
    expect(encounterCost([{ level: "", minion: true, count: 8 }], party)).toBe(12);
  });

  it("warns outside 1–3 monsters per hero and about minion swarms", () => {
    expect(encounterWarnings([{ level: "1", minion: false, count: 13 }], 4)[0]).toMatch(/more than 3 per hero/);
    expect(encounterWarnings([{ level: "1", minion: false, count: 2 }], 4)[0]).toMatch(/outnumber/);
    expect(encounterWarnings([{ level: "1", minion: false, count: 6 }], 4)).toEqual([]);
    expect(encounterWarnings([{ level: "", minion: true, count: 20 }], 4)[0]).toMatch(/MUCH more challenging/);
  });

  it("suggests minion dice by party level, including overlaps", () => {
    expect(suggestedMinionDice(1)).toEqual(["d4"]);
    expect(suggestedMinionDice(2)).toEqual(["d4", "d6"]);
    expect(suggestedMinionDice(10)).toEqual(["d8", "d10"]);
    expect(suggestedMinionDice(20)).toEqual(["d20"]);
  });
});
