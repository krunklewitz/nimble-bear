// GM campaign: autosave, undo, campaign/monster files, combat tracker rules.
import { describe, expect, it } from "vitest";
import { CampaignBook } from "../src/app/campaign";
import { createMemoryStore } from "../src/platform/storage/memory";
import { sha256Hex } from "../src/platform/files";
import { MONSTER_FILE_FORMAT, type Monster } from "../src/rules/persistence/campaign";
import { damageAfterArmor, damageCombatant, healCombatant, nextRound, startEncounter, toggleDone } from "../src/rules/tracker";

let n = 0;
const deps = (store = createMemoryStore()) => ({ store, hash: sha256Hex, now: () => new Date("2026-11-28T12:00:00Z"), newId: () => `id${++n}`, appVersion: "test", dateStamp: () => "2026-11-28" });

const goblin: Monster = { id: "m.goblin", name: "Goblin", level: "1/2", minion: false, hp: 15, armor: "none", abilities: [{ name: "Stab", text: "1d6." }] };
const guard: Monster = { id: "m.guard", name: "Guard", level: "2", minion: false, hp: 20, armor: "medium", abilities: [] };
const minion: Monster = { id: "m.minion", name: "Goblin Minion", level: "1/3", minion: true, armor: "none", abilities: [] };

async function withEncounter() {
  const book = await CampaignBook.open(deps());
  await book.update("Add monsters", (d) => void d.monsters.push(goblin, guard, minion));
  await book.update("Add encounter", (d) => void d.encounters.push({ id: "e1", name: "Ambush", heroLevels: [2, 2], monsters: [{ monsterId: "m.goblin", count: 2 }, { monsterId: "m.guard", count: 1 }, { monsterId: "m.minion", count: 3 }] }));
  return book;
}

describe("campaign book", () => {
  it("autosaves every change and reopens with it", async () => {
    const store = createMemoryStore();
    const book = await CampaignBook.open(deps(store));
    await book.update("Add goblin", (d) => void d.monsters.push(goblin));
    const again = await CampaignBook.open(deps(store));
    expect(again.get().monsters.map((m) => m.name)).toEqual(["Goblin"]);
  });

  it("rejects invalid changes without changing anything", async () => {
    const book = await CampaignBook.open(deps());
    await expect(book.update("Bad", (d) => void d.monsters.push({ ...goblin, level: "lots" }))).rejects.toThrow();
    expect(book.get().monsters).toEqual([]);
  });

  it("undoes the last change", async () => {
    const book = await CampaignBook.open(deps());
    await book.update("Add goblin", (d) => void d.monsters.push(goblin));
    expect(book.canUndo()).toBe("Add goblin");
    await book.undoLast();
    expect(book.get().monsters).toEqual([]);
  });

  it("round-trips through a campaign file, and keeps the old copy when loading", async () => {
    const book = await withEncounter();
    const file = await book.buildFile();
    await book.markSaved(file.checksum);
    expect(book.isUnsaved()).toBe(false);
    expect(file.fileName).toBe("My-campaign_2026-11-28.nimble-campaign.json");

    const other = await CampaignBook.open(deps());
    await other.update("Something local", (d) => void d.monsters.push(minion));
    const plan = await other.prepareImport(file.text);
    expect(plan.kind).toBe("campaign");
    if (plan.kind !== "campaign") return;
    expect(plan.checksumMatches).toBe(true);
    expect(plan.localUnsaved).toBe(true);
    await other.useCampaign(plan.campaign, plan.checksum);
    expect(other.get().encounters[0]?.name).toBe("Ambush");
    expect(await other.restorePrevious()).toBe(true);
    expect(other.get().monsters.map((m) => m.id)).toEqual(["m.minion"]);
  });

  it("loads a monster file, replacing monsters with the same id", async () => {
    const book = await CampaignBook.open(deps());
    await book.update("Add goblin", (d) => void d.monsters.push(goblin));
    const text = JSON.stringify({ format: MONSTER_FILE_FORMAT, monsters: [{ ...goblin, hp: 16 }, guard] });
    const plan = await book.prepareImport(text);
    expect(plan).toMatchObject({ kind: "monsters", added: 1, replaced: 1 });
    if (plan.kind === "monsters") await book.addMonsters(plan.monsters);
    expect(book.get().monsters.map((m) => [m.id, m.hp])).toEqual([["m.goblin", 16], ["m.guard", 20]]);
  });

  it("refuses files that aren't campaign or monster files", async () => {
    const book = await CampaignBook.open(deps());
    expect((await book.prepareImport("{}")).kind).toBe("invalid");
    expect((await book.prepareImport("not json")).kind).toBe("invalid");
  });
});

describe("combat tracker", () => {
  it("starts an encounter: heroes first, then numbered monsters; minions have no HP", async () => {
    const book = await withEncounter();
    await book.update("Start", (d) => startEncounter(d, "e1", ["Brakka", "Hazel"], () => `c${++n}`));
    const t = book.get().tracker;
    expect(t.active).toBe(true);
    expect(t.round).toBe(1);
    expect(t.combatants.map((c) => c.name)).toEqual(["Brakka", "Hazel", "Goblin 1", "Goblin 2", "Guard", "Goblin Minion 1", "Goblin Minion 2", "Goblin Minion 3"]);
    expect(t.combatants.find((c) => c.name === "Guard")).toMatchObject({ hp: 20, hpMax: 20, armor: "medium" });
    expect(t.combatants.find((c) => c.name === "Goblin Minion 1")?.hp).toBeUndefined();
  });

  it("armor reduces damage unless it's a crit (Core p.15)", () => {
    expect(damageAfterArmor(15, "medium", false)).toBe(5);
    expect(damageAfterArmor(15, "heavy", false)).toBe(0);
    expect(damageAfterArmor(15, "heavy", true)).toBe(15);
  });

  it("damage, defeat at 0 HP, healing, minions die to any damage", async () => {
    const book = await withEncounter();
    await book.update("Start", (d) => startEncounter(d, "e1", [], () => `c${++n}`));
    const id = (name: string) => book.get().tracker.combatants.find((c) => c.name === name)?.id ?? "";
    await book.update("Hit guard", (d) => void damageCombatant(d, id("Guard"), 25, false));
    expect(book.get().tracker.combatants.find((c) => c.name === "Guard")?.hp).toBe(5);
    await book.update("Crit guard", (d) => void damageCombatant(d, id("Guard"), 9, true));
    expect(book.get().tracker.combatants.find((c) => c.name === "Guard")).toMatchObject({ hp: 0, defeated: true });
    await book.update("Heal guard", (d) => healCombatant(d, id("Guard"), 3));
    expect(book.get().tracker.combatants.find((c) => c.name === "Guard")).toMatchObject({ hp: 3, defeated: false });
    await book.update("Hit minion", (d) => void damageCombatant(d, id("Goblin Minion 2"), 1, false));
    expect(book.get().tracker.combatants.find((c) => c.name === "Goblin Minion 2")?.defeated).toBe(true);
  });

  it("marks turns taken and clears them each round", async () => {
    const book = await withEncounter();
    await book.update("Start", (d) => startEncounter(d, "e1", ["Brakka"], () => `c${++n}`));
    const first = book.get().tracker.combatants[0]?.id ?? "";
    await book.update("Done", (d) => toggleDone(d, first));
    expect(book.get().tracker.combatants[0]?.done).toBe(true);
    await book.update("Next round", (d) => nextRound(d));
    expect(book.get().tracker.round).toBe(2);
    expect(book.get().tracker.combatants.every((c) => !c.done)).toBe(true);
  });
});
