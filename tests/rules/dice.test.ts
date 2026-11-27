import { describe, expect, it } from "vitest";
import { dropIndexes, initiativeActions, resolveAttack, rollAttackDice, rollD20, rollPlain, scriptedRng, type AttackInput } from "../../src/rules/dice";
import { diceText, evalNumber, parseFormula, references, toDice } from "../../src/rules/formula";

const scope = { LVL: 3, KEY: 2, STR: 2, DEX: 1, INT: -1, WIL: 3 };

describe("formula", () => {
  it("evaluates numbers, refs, functions and precedence", () => {
    expect(evalNumber("(WIL*3)+LVL", scope)).toBe(12);
    expect(evalNumber("10+STR", scope)).toBe(12);
    expect(evalNumber("6+min(DEX,2)", { ...scope, DEX: 4 })).toBe(8);
    expect(evalNumber("half(LVL)", scope)).toBe(1);
    expect(evalNumber("-INT", scope)).toBe(1);
    expect(evalNumber("2×LVL", scope)).toBe(6);
    expect(evalNumber("var.x+1", { ...scope, "var.x": 4 })).toBe(5);
  });

  it("turns dice formulas into dice + flat", () => {
    expect(toDice("1d8+STR", scope)).toEqual({ groups: [{ count: 1, sides: 8, tens: false }], flat: 2 });
    expect(toDice("2d4+DEX-1", scope)).toEqual({ groups: [{ count: 2, sides: 4, tens: false }], flat: 0 });
    // Core p.7: "WIL d8" means roll WIL dice.
    expect(toDice("WIL d20", scope)).toEqual({ groups: [{ count: 3, sides: 20, tens: false }], flat: 0 });
    expect(toDice("d66", scope)).toEqual({ groups: [{ count: 1, sides: 6, tens: true }], flat: 0 });
    expect(toDice("1d100", scope).groups[0]?.sides).toBe(100);
    expect(toDice("30", scope)).toEqual({ groups: [], flat: 30 });
    expect(diceText(toDice("1d8+STR", scope))).toBe("1d8+2");
  });

  it("rejects bad formulas clearly", () => {
    expect(() => parseFormula("2 +")).toThrow(/end of formula/);
    expect(() => parseFormula("FOO+1")).toThrow(/Unknown name "FOO"/);
    expect(() => toDice("2*1d6", scope)).toThrow(/top level/);
    expect(() => evalNumber("1d6", scope)).toThrow(/dice/);
    expect(references("1d8+STR+var.sneak")).toEqual(["STR", "var.sneak"]);
  });
});

const attack = (over: Partial<AttackInput> = {}): AttackInput => ({
  dice: toDice("1d6+2", scope),
  advantage: 0,
  canMiss: true,
  canCrit: true,
  vicious: false,
  ...over,
});

const run = (input: AttackInput, values: number[], override?: number) => {
  const rng = scriptedRng(values);
  return resolveAttack(rollAttackDice(input, rng), input, rng, override);
};

describe("attack rolls (Core p.9, p.14)", () => {
  it("hits for dice + modifier", () => {
    const r = run(attack(), [4]);
    expect(r).toMatchObject({ total: 6, miss: false, crit: false, primary: 4 });
  });

  it("misses when the Primary Die is 1", () => {
    expect(run(attack(), [1])).toMatchObject({ total: 0, miss: true });
  });

  it("explodes on max, repeatedly", () => {
    const r = run(attack(), [6, 6, 3]);
    expect(r).toMatchObject({ crit: true, explosions: 2, total: 6 + 6 + 3 + 2 });
  });

  it("adds a Vicious die per crit roll", () => {
    const r = run(attack({ vicious: true }), [6, 2, 5]);
    expect(r.dice.map((d) => d.role)).toEqual(["base", "explosion", "vicious"]);
    expect(r.total).toBe(6 + 2 + 5 + 2);
  });

  it("uses the leftmost remaining die as Primary (book example 1: short sword with advantage)", () => {
    // Rolls 5, 1 → remove the lowest (1) → Primary 5 → hit.
    const r = run(attack({ advantage: 1 }), [5, 1]);
    expect(r.dice.map((d) => d.kept)).toEqual([true, false]);
    expect(r).toMatchObject({ miss: false, primary: 5, total: 7 });
  });

  it("removes ties left to right (book example 2: greataxe 2d6 with disadvantage 2 misses)", () => {
    // Rolls 4, 1, 4, 4 → remove the 2 highest, ties left to right → keeps 1, 4 → Primary 1 → miss.
    const r = run(attack({ dice: toDice("2d6+STR", scope), advantage: -2 }), [4, 1, 4, 4]);
    expect(r.dice.map((d) => d.kept)).toEqual([false, true, false, true]);
    expect(r.miss).toBe(true);
  });

  it("only adds on-crit bonus dice when it crits (Sneak Attack)", () => {
    const sneak = { label: "Sneak Attack", spec: toDice("1d6", scope), onCrit: true };
    expect(run(attack({ bonus: [sneak] }), [3]).total).toBe(5);
    const crit = run(attack({ bonus: [sneak] }), [6, 1, 4]);
    expect(crit.total).toBe(6 + 1 + 4 + 2);
    expect(crit.dice.at(-1)).toMatchObject({ role: "bonus", label: "Sneak Attack" });
  });

  it("lets the player change the Primary Die (Vicious Opportunist), max counting as a crit", () => {
    const input = attack();
    const rng = scriptedRng([2, 3]);
    const rolled = rollAttackDice(input, rng);
    const changed = resolveAttack(rolled, input, rng, 6);
    expect(changed).toMatchObject({ crit: true, primary: 6, total: 6 + 3 + 2 });
  });

  it("never misses or crits when not allowed (AoE)", () => {
    expect(run(attack({ canMiss: false, canCrit: false }), [1])).toMatchObject({ miss: false, total: 3 });
    expect(run(attack({ canMiss: false, canCrit: false }), [6])).toMatchObject({ crit: false, total: 8 });
  });

  it("reads d66 as tens and ones with no Primary Die", () => {
    const r = run(attack({ dice: toDice("d66", scope) }), [3, 4]);
    expect(r).toMatchObject({ total: 34, miss: false, crit: false, primary: undefined });
    // Advantage: roll 3d6, drop lowest, leftmost is tens (Core p.51 example: 2,3,4 → 34).
    expect(run(attack({ dice: toDice("d66", scope), advantage: 1 }), [2, 3, 4]).total).toBe(34);
  });
});

describe("d20 rolls", () => {
  it("adds the modifier and flags naturals", () => {
    expect(rollD20({ modifier: 3, advantage: 0 }, scriptedRng([20]))).toMatchObject({ total: 23, autoSuccess: true });
    expect(rollD20({ modifier: 3, advantage: 0 }, scriptedRng([1]))).toMatchObject({ total: 4, autoFail: true });
  });
  it("keeps the highest with advantage and the lowest with disadvantage", () => {
    expect(rollD20({ modifier: 0, advantage: 2 }, scriptedRng([3, 15, 9])).natural).toBe(15);
    expect(rollD20({ modifier: 0, advantage: -1 }, scriptedRng([3, 15])).natural).toBe(3);
  });
});

describe("initiative actions (Core p.12)", () => {
  const table = [
    { minTotal: null, maxTotal: 9, actions: 1 },
    { minTotal: 10, maxTotal: 19, actions: 2 },
    { minTotal: 20, maxTotal: null, actions: 3 },
  ];
  it("maps single digits to 1, two digits to 2, 20+ or natural 20 to 3", () => {
    expect(initiativeActions(9, 7, table)).toBe(1);
    expect(initiativeActions(-2, 1, table)).toBe(1);
    expect(initiativeActions(10, 8, table)).toBe(2);
    expect(initiativeActions(22, 18, table)).toBe(3);
    expect(initiativeActions(19, 20, table)).toBe(3);
  });
});

describe("helpers", () => {
  it("drops ties left to right", () => {
    expect([...dropIndexes([4, 1, 4, 4], 2, "highest")]).toEqual([0, 2]);
    expect([...dropIndexes([2, 2, 5], 1, "lowest")]).toEqual([0]);
  });
  it("rolls plain dice with no crit", () => {
    expect(rollPlain(toDice("2d8+3", scope), scriptedRng([8, 8])).total).toBe(19);
  });
});
