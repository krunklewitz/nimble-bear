import { describe, expect, it } from "vitest";
import { changePrimary, describe as describeRoll, optionsFor, performRoll, RollLog, toMessage, type RollRequest } from "../src/app/rolls";
import { getContent } from "../src/data/content";
import { createCharacter } from "../src/rules/build";
import { scriptedRng } from "../src/rules/dice";
import { derive } from "../src/rules/derive";

const content = getContent();
const stabs = createCharacter(
  content,
  {
    name: "Stabs!",
    classId: "class.cheat",
    ancestryId: "ancestry.kobold",
    ancestryChoices: {},
    backgroundId: "background.acrobat",
    backgroundChoices: {},
    statArrayId: "standard",
    assign: { STR: -1, DEX: 2, INT: 2, WIL: 0 },
    skillPoints: { finesse: 1, influence: 1, stealth: 2 },
    languages: [],
    kit: "class",
  },
  "id",
  "2026-11-27T00:00:00Z",
);
const sheet = derive(content, stabs);
const dagger = sheet.actions.find((a) => a.id === "attack.weapon.dagger");
if (!dagger) throw new Error("no dagger");

const attackReq = (over: Partial<RollRequest> = {}): RollRequest => {
  const options = optionsFor(sheet, "attack", { group: "melee" }, {});
  return { kind: "attack", label: "Dagger", action: dagger, advantage: 0, rushed: 0, toggles: [], options, ...over };
};

describe("roll service", () => {
  it("classifies options: Sneak Attack is automatic on crit, Vicious Opportunist is a toggle", () => {
    const opts = optionsFor(sheet, "attack", { group: "melee" }, {});
    const sneak = opts.find((o) => o.option.id === "roll.cheat.sneak-attack");
    expect(sneak).toMatchObject({ how: "auto", onCrit: true });
    expect(opts.find((o) => o.option.change === "setPrimary")?.how).toBe("toggle");
  });

  it("adds Sneak Attack dice only on a crit", () => {
    const hit = performRoll(sheet, attackReq(), scriptedRng([3]));
    expect(hit.kind === "attack" && hit.result.total).toBe(5);
    const crit = performRoll(sheet, attackReq(), scriptedRng([4, 2, 5]));
    expect(crit.kind === "attack" && crit.result.total).toBe(4 + 2 + 5 + 2);
  });

  it("applies Rushed Attacks as disadvantage", () => {
    const r = performRoll(sheet, attackReq({ rushed: 1 }), scriptedRng([4, 2]));
    expect(r.kind === "attack" && r.result.primary).toBe(2);
  });

  it("lets the player change the Primary Die when Vicious Opportunist is on", () => {
    const req = attackReq({ toggles: [optionsFor(sheet, "attack", { group: "melee" }, {}).find((o) => o.option.change === "setPrimary")?.option.id ?? ""] });
    const r = performRoll(sheet, req, scriptedRng([2]));
    if (r.kind !== "attack") throw new Error("not an attack");
    expect(r.canSetPrimary).toBeDefined();
    const changed = changePrimary(r, 4, scriptedRng([1, 3]));
    expect(changed.result.crit).toBe(true);
  });

  it("raises an Initiative total below 10 to 10 at level 2 (Cheat)", () => {
    const l2 = structuredClone(stabs);
    l2.build.levels.push({ level: 2, classId: "class.cheat", hp: { method: "average", value: 4 }, skillPoints: { stealth: 1 }, choices: {} });
    const s2 = derive(content, l2);
    const options = optionsFor(s2, "initiative", {}, {});
    const r = performRoll(s2, { kind: "initiative", label: "Initiative", modifier: 2, advantage: 0, rushed: 0, toggles: [], options }, scriptedRng([3]));
    expect(r.kind === "d20" && r.floorTo).toBe(10);
    expect(describeRoll(r, { kind: "initiative", label: "Initiative", modifier: 2, advantage: 0, rushed: 0, toggles: [], options }).total).toBe(10);
  });

  it("builds a message with a readable breakdown and keeps a log", () => {
    const req = attackReq();
    const r = performRoll(sheet, req, scriptedRng([1]));
    const m = toMessage("m1", "Stabs!", "Player", req, r, "public", "2026-11-27T00:00:00Z");
    expect(m).toMatchObject({ label: "Dagger", miss: true, total: 0 });
    expect(m.summary).toContain("miss");
    expect(JSON.stringify(m).length).toBeLessThan(16000);
    const log = new RollLog(2);
    log.add(m);
    log.add(m);
    log.add({ ...m, id: "m2" });
    log.add({ ...m, id: "m3" });
    expect(log.list().map((x) => x.id)).toEqual(["m3", "m2"]);
  });
});
