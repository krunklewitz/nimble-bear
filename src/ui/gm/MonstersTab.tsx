import { useRef, useState } from "react";
import { readFileText } from "../../platform/files";
import type { Armor, Monster } from "../../rules/persistence/campaign";
import { useCampaign } from "./CampaignContext";

export const ARMOR_LABEL: Record<Armor, string> = { none: "", medium: "Medium Armor", heavy: "Heavy Armor" };

/** One-line stat summary in the GMG's order: level, size, HP, armor, Speed. */
export function monsterLine(m: Monster): string {
  return [m.minion ? "minion" : `lvl ${m.level}`, m.size, m.minion ? "" : m.hp !== undefined ? `${m.hp} HP` : "", ARMOR_LABEL[m.armor], m.speed ? `Speed ${m.speed}` : ""].filter(Boolean).join(" · ");
}

interface Draft {
  name: string;
  level: string;
  minion: boolean;
  size: string;
  hp: string;
  armor: Armor;
  speed: string;
  saves: string;
  abilities: string;
  source: string;
}

const EMPTY: Draft = { name: "", level: "1", minion: false, size: "medium", hp: "", armor: "none", speed: "", saves: "", abilities: "", source: "" };

const toDraft = (m: Monster): Draft => ({
  name: m.name,
  level: m.level,
  minion: m.minion,
  size: m.size ?? "",
  hp: m.hp === undefined ? "" : String(m.hp),
  armor: m.armor,
  speed: m.speed ?? "",
  saves: m.saves ?? "",
  abilities: m.abilities.map((a) => (a.name ? `${a.name}. ${a.text}` : a.text)).join("\n"),
  source: m.source ?? "",
});

/** Abilities are typed one per line: "Name. Text". */
function parseAbilities(text: string): Monster["abilities"] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^([^.!?]{1,60}[.!?])\s+(.*)$/.exec(l);
      return m ? { name: (m[1] ?? "").replace(/[.]$/, ""), text: m[2] ?? "" } : { name: "", text: l };
    });
}

export function MonstersTab() {
  const book = useCampaign();
  const monsters = book.get().monsters;
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    const monster: Monster = {
      id: editing.id ?? `monster.${book.newId()}`,
      name: d.name.trim(),
      level: d.minion ? d.level.trim() || "1" : d.level.trim(),
      minion: d.minion,
      ...(d.size.trim() ? { size: d.size.trim() } : {}),
      ...(!d.minion && d.hp.trim() ? { hp: Math.max(0, Math.floor(Number(d.hp))) } : {}),
      armor: d.armor,
      ...(d.speed.trim() ? { speed: d.speed.trim() } : {}),
      ...(d.saves.trim() ? { saves: d.saves.trim() } : {}),
      abilities: parseAbilities(d.abilities),
      ...(d.source.trim() ? { source: d.source.trim() } : {}),
    };
    try {
      await book.update(editing.id ? `Edit ${monster.name}` : `Add ${monster.name}`, (c) => {
        const i = c.monsters.findIndex((m) => m.id === monster.id);
        if (i >= 0) c.monsters[i] = monster;
        else c.monsters.push(monster);
      });
      setEditing(null);
      setMessage("");
    } catch {
      setMessage("Check the name, and the level (a number like 4, or a fraction like 1/2).");
    }
  };

  const loadFile = async (file: File) => {
    const plan = await book.prepareImport(await readFileText(file));
    if (plan.kind === "invalid") return setMessage(plan.error);
    if (plan.kind === "campaign") return setMessage("That's a whole campaign file: load it on the Campaign tab.");
    await book.addMonsters(plan.monsters);
    setMessage(`Loaded ${plan.monsters.length} monsters (${plan.added} new, ${plan.replaced} updated).`);
  };

  if (editing) {
    const d = editing.draft;
    const set = (patch: Partial<Draft>) => setEditing({ ...editing, draft: { ...d, ...patch } });
    return (
      <div className="tab-body">
        <h2>{editing.id ? "Edit monster" : "New monster"}</h2>
        <label className="field">
          Name
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="option compact">
          <input type="checkbox" checked={d.minion} onChange={(e) => set({ minion: e.target.checked })} />
          <span>Minion (no HP: any damage kills it)</span>
        </label>
        <div className="row">
          <label className="field">
            Level
            <input className="small-input" value={d.level} onChange={(e) => set({ level: e.target.value })} placeholder="1/2" />
          </label>
          {!d.minion && (
            <label className="field">
              HP
              <input className="small-input" inputMode="numeric" value={d.hp} onChange={(e) => set({ hp: e.target.value })} />
            </label>
          )}
          <label className="field">
            Size
            <input className="small-input" value={d.size} onChange={(e) => set({ size: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <label className="field">
            Armor
            <select value={d.armor} onChange={(e) => set({ armor: e.target.value as Armor })}>
              <option value="none">None</option>
              <option value="medium">Medium (−10)</option>
              <option value="heavy">Heavy (−20)</option>
            </select>
          </label>
          <label className="field">
            Speed
            <input className="small-input" value={d.speed} onChange={(e) => set({ speed: e.target.value })} placeholder="6" />
          </label>
          <label className="field">
            Saves
            <input className="small-input" value={d.saves} onChange={(e) => set({ saves: e.target.value })} />
          </label>
        </div>
        <label className="field">
          Abilities (one per line: “Name. What it does”)
          <textarea rows={5} value={d.abilities} onChange={(e) => set({ abilities: e.target.value })} />
        </label>
        <label className="field">
          Source (optional)
          <input value={d.source} onChange={(e) => set({ source: e.target.value })} placeholder="GMG p.28" />
        </label>
        {message && <p className="small banner error">{message}</p>}
        <div className="row">
          <button type="button" className="primary" disabled={!d.name.trim()} onClick={() => void save()}>
            Save monster
          </button>
          <button type="button" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const shown = monsters.filter((m) => m.name.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <div className="tab-body">
      <p className="small">Monsters stay on this device and in your campaign file. Nimble Bear doesn't include any: add your own, or load a monster file you made.</p>
      <div className="row">
        <button type="button" className="primary" onClick={() => setEditing({ id: null, draft: EMPTY })}>
          + Add monster
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Load monster file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void loadFile(f);
          }}
        />
      </div>
      {message && <p className="small" role="status">{message}</p>}
      {monsters.length > 6 && <input aria-label="Find a monster" placeholder="Find…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {monsters.length === 0 && <p className="small">No monsters yet.</p>}
      <ul className="rows">
        {shown.map((m) => (
          <li key={m.id} className="row-item">
            <details>
              <summary>
                <span className="row-name">{m.name}</span>
                <span className="row-meta">{monsterLine(m)}</span>
              </summary>
              {m.saves && <p className="small">Saves: {m.saves}</p>}
              {m.abilities.map((a, i) => (
                <p key={i} className="small">
                  {a.name && <strong>{a.name}. </strong>}
                  {a.text}
                </p>
              ))}
              {m.source && <p className="small source">{m.source}</p>}
              <div className="row">
                <button type="button" className="mini" onClick={() => setEditing({ id: m.id, draft: toDraft(m) })}>
                  Edit
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => {
                    const used = book.get().encounters.filter((e) => e.monsters.some((x) => x.monsterId === m.id)).length;
                    if (window.confirm(used ? `${m.name} is in ${used} encounter(s); it will be removed from them too. Delete?` : `Delete ${m.name}?`))
                      void book.update(`Delete ${m.name}`, (c) => {
                        c.monsters = c.monsters.filter((x) => x.id !== m.id);
                        for (const e of c.encounters) e.monsters = e.monsters.filter((x) => x.monsterId !== m.id);
                      });
                  }}
                >
                  Delete
                </button>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
