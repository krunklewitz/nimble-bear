import { useState } from "react";
import { averageLevel, DIFFICULTIES, difficultyOf, encounterCost, encounterWarnings, monsterBudget, suggestedMinionDice } from "../../rules/encounter";
import type { Encounter } from "../../rules/persistence/campaign";
import { startEncounter } from "../../rules/tracker";
import { useCampaign } from "./CampaignContext";
import { monsterLine } from "./MonstersTab";

/** "3, 3, 4" → [3, 3, 4] (levels 1–20 only). */
export function parseHeroLevels(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((x) => Math.floor(Number(x)))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 20);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Budget, cost and difficulty, with the guideline warnings. */
function BudgetSummary({ encounter }: { encounter: Encounter }) {
  const book = useCampaign();
  const monsters = book.get().monsters;
  const entries = encounter.monsters.flatMap((e) => {
    const m = monsters.find((x) => x.id === e.monsterId);
    return m ? [{ level: m.level, minion: m.minion, count: e.count }] : [];
  });
  const budget = monsterBudget(encounter.heroLevels);
  const cost = encounterCost(entries, encounter.heroLevels);
  const { difficulty, percent } = difficultyOf(cost, budget);
  const warnings = encounterWarnings(entries, encounter.heroLevels.length);
  const hasMinions = entries.some((e) => e.minion);
  return (
    <div className="note small">
      <p>
        <strong>
          {budget > 0 ? `${difficulty.label} · ${percent}%` : "No heroes yet"}
        </strong>{" "}
        of a budget of {budget} (monsters: {fmt(cost)} levels).
      </p>
      <p className="small">{DIFFICULTIES.map((d) => `${d.label} ${fmt((budget * d.percent) / 100)}`).join(" · ")}</p>
      {hasMinions && (
        <p className="small">
          Minions count as half the heroes' average level each. Suggested minion die: {suggestedMinionDice(averageLevel(encounter.heroLevels)).join(" or ")}.
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="small">
          ⚠ {w}
        </p>
      ))}
      <p className="small source">GMG p.22–23</p>
    </div>
  );
}

export function EncountersTab({ onStarted, onMonsters }: { onStarted: () => void; onMonsters: () => void }) {
  const book = useCampaign();
  const campaign = book.get();
  const [openId, setOpenId] = useState<string | null>(null);
  const [levelsText, setLevelsText] = useState("");
  const [heroNames, setHeroNames] = useState("");
  const [addMonster, setAddMonster] = useState("");

  const open = campaign.encounters.find((e) => e.id === openId) ?? null;
  const change = (label: string, fn: (e: Encounter) => void) =>
    open &&
    void book.update(label, (c) => {
      const e = c.encounters.find((x) => x.id === open.id);
      if (e) fn(e);
    });

  const create = async () => {
    const id = `encounter.${book.newId()}`;
    const last = campaign.encounters.at(-1);
    await book.update("New encounter", (c) => void c.encounters.push({ id, name: `Encounter ${c.encounters.length + 1}`, heroLevels: last?.heroLevels ?? [], monsters: [] }));
    setOpenId(id);
    setLevelsText((last?.heroLevels ?? []).join(", "));
  };

  if (open) {
    return (
      <div className="tab-body">
        <button type="button" className="link" onClick={() => setOpenId(null)}>
          ← All encounters
        </button>
        <label className="field">
          Name
          <input value={open.name} onChange={(e) => change("Rename encounter", (x) => void (x.name = e.target.value || x.name))} />
        </label>
        <label className="field">
          Heroes' levels (e.g. 3, 3, 4, 4)
          <input
            value={levelsText}
            onChange={(e) => {
              setLevelsText(e.target.value);
              change("Hero levels", (x) => void (x.heroLevels = parseHeroLevels(e.target.value)));
            }}
          />
        </label>
        <BudgetSummary encounter={open} />

        <h2>Monsters</h2>
        {open.monsters.length === 0 && <p className="small">None yet.</p>}
        <ul className="rows">
          {open.monsters.map((entry) => {
            const m = campaign.monsters.find((x) => x.id === entry.monsterId);
            if (!m) return null;
            return (
              <li key={entry.monsterId} className="row-item">
                <span style={{ flex: 1 }}>
                  <strong>{m.name}</strong> <span className="small">{monsterLine(m)}</span>
                </span>
                <button type="button" className="mini" aria-label={`One fewer ${m.name}`} onClick={() => change(`− ${m.name}`, (x) => void (x.monsters = x.monsters.flatMap((y) => (y.monsterId !== m.id ? [y] : y.count > 1 ? [{ ...y, count: y.count - 1 }] : []))))}>
                  −
                </button>
                <strong aria-label={`${entry.count} ${m.name}`}>{entry.count}</strong>
                <button type="button" className="mini" aria-label={`One more ${m.name}`} onClick={() => change(`+ ${m.name}`, (x) => void (x.monsters = x.monsters.map((y) => (y.monsterId === m.id ? { ...y, count: Math.min(99, y.count + 1) } : y))))}>
                  +
                </button>
              </li>
            );
          })}
        </ul>
        {campaign.monsters.length === 0 ? (
          <p className="small">
            Add monsters on the{" "}
            <button type="button" className="link" onClick={onMonsters}>
              Monsters tab
            </button>{" "}
            first.
          </p>
        ) : (
          <div className="row">
            <select aria-label="Monster to add" value={addMonster} onChange={(e) => setAddMonster(e.target.value)}>
              <option value="">Add a monster…</option>
              {campaign.monsters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.minion ? "minion" : `lvl ${m.level}`})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!addMonster}
              onClick={() => {
                const id = addMonster;
                change("Add monster", (x) => {
                  const y = x.monsters.find((z) => z.monsterId === id);
                  if (y) y.count = Math.min(99, y.count + 1);
                  else x.monsters.push({ monsterId: id, count: 1 });
                });
                setAddMonster("");
              }}
            >
              Add
            </button>
          </div>
        )}

        <h2>Run it</h2>
        <label className="field">
          Heroes in the fight (names, comma-separated; heroes go first)
          <input value={heroNames} onChange={(e) => setHeroNames(e.target.value)} placeholder="Brakka, Hazel, Pip" />
        </label>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={open.monsters.length === 0}
            onClick={() => {
              if (campaign.tracker.active && !window.confirm("A fight is already running in the tracker. Replace it?")) return;
              void book.update(`Start ${open.name}`, (c) => startEncounter(c, open.id, heroNames.split(","), () => book.newId())).then(onStarted);
            }}
          >
            Start in tracker
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete ${open.name}?`)) {
                void book.update(`Delete ${open.name}`, (c) => void (c.encounters = c.encounters.filter((x) => x.id !== open.id)));
                setOpenId(null);
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-body">
      <button type="button" className="primary" onClick={() => void create()}>
        + New encounter
      </button>
      {campaign.encounters.length === 0 && <p className="small">No encounters yet. The builder uses the GMG's Monster Budget: the total of the heroes' levels.</p>}
      <ul className="rows">
        {campaign.encounters.map((e) => {
          const entries = e.monsters.flatMap((x) => {
            const m = campaign.monsters.find((y) => y.id === x.monsterId);
            return m ? [{ level: m.level, minion: m.minion, count: x.count }] : [];
          });
          const budget = monsterBudget(e.heroLevels);
          const d = difficultyOf(encounterCost(entries, e.heroLevels), budget);
          return (
            <li key={e.id} className="row-item">
              <button
                type="button"
                className="char-row"
                onClick={() => {
                  setOpenId(e.id);
                  setLevelsText(e.heroLevels.join(", "));
                }}
              >
                <span className="char-name">{e.name}</span>
                <span className="small">{entries.reduce((n, x) => n + x.count, 0)} monsters</span>
                <span className="badge pending">{budget > 0 ? `${d.difficulty.label} ${d.percent}%` : "no heroes"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
