import { useMemo, useRef, useState } from "react";
import { readFileText } from "../../platform/files";
import type { Armor, Monster } from "../../rules/persistence/campaign";
import { useCampaign } from "./CampaignContext";

export const ARMOR_LABEL: Record<Armor, string> = { none: "", medium: "Medium Armor", heavy: "Heavy Armor" };

/** HP as printed: a number, "28/hero" for Legendary monsters, nothing for minions. */
export function hpText(m: Monster): string {
  if (m.minion) return "";
  if (m.hpPerHero !== undefined) return `${m.hpPerHero} HP/hero`;
  return m.hp !== undefined ? `${m.hp} HP` : "";
}

/** One-line stat summary in the GMG's order: level, size, HP, armor, Speed. */
export function monsterLine(m: Monster): string {
  return [m.minion ? "minion" : `lvl ${m.level}`, m.legendary, m.size, hpText(m), ARMOR_LABEL[m.armor], m.speed ? `Speed ${m.speed}` : ""].filter(Boolean).join(" · ");
}

/** Abilities and notes, as shown on the Monsters tab and in the tracker. */
export function MonsterDetails({ m }: { m: Monster }) {
  return (
    <>
      {(m.type || m.saves) && <p className="small">{[m.type, m.saves ? `Saves: ${m.saves}` : ""].filter(Boolean).join(" · ")}</p>}
      {m.abilities.map((a, i) => (
        <p key={i} className="small">
          {a.name && <strong>{a.name}. </strong>}
          {a.text}
        </p>
      ))}
      {m.lastStandHpPerHero !== undefined && <p className="small">Last Stand: regains {m.lastStandHpPerHero} HP per hero.</p>}
      {m.notes && (
        <details>
          <summary className="small">Notes and tactics</summary>
          <p className="small feature-text">{m.notes}</p>
        </details>
      )}
      {m.source && <p className="small source">{m.source}</p>}
    </>
  );
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
  group: string;
  type: string;
  legendary: "" | "Legendary" | "Solo";
  hpPerHero: string;
  lastStandHpPerHero: string;
  notes: string;
}

const EMPTY: Draft = { name: "", level: "1", minion: false, size: "medium", hp: "", armor: "none", speed: "", saves: "", abilities: "", source: "", group: "", type: "", legendary: "", hpPerHero: "", lastStandHpPerHero: "", notes: "" };

const num = (n: number | undefined) => (n === undefined ? "" : String(n));

const toDraft = (m: Monster): Draft => ({
  name: m.name,
  level: m.level,
  minion: m.minion,
  size: m.size ?? "",
  hp: num(m.hp),
  armor: m.armor,
  speed: m.speed ?? "",
  saves: m.saves ?? "",
  abilities: m.abilities.map((a) => (a.name ? `${a.name}. ${a.text}` : a.text)).join("\n"),
  source: m.source ?? "",
  group: m.group ?? "",
  type: m.type ?? "",
  legendary: m.legendary ?? "",
  hpPerHero: num(m.hpPerHero),
  lastStandHpPerHero: num(m.lastStandHpPerHero),
  notes: m.notes ?? "",
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

const whole = (s: string) => (s.trim() ? Math.max(0, Math.floor(Number(s))) : undefined);

/** The book a monster came from, from its source note ("GMG p.28" → "GMG"). */
export function bookOf(m: Monster): string {
  const s = m.source?.trim();
  if (!s) return "Yours";
  return s.replace(/\s*p\.?\s*\d+.*$/i, "").trim() || "Yours";
}

/** Finds monsters by name, group or type (all words must match). */
export function searchMonsters(monsters: Monster[], query: string, book = ""): Monster[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return monsters.filter((m) => {
    if (book && bookOf(m) !== book) return false;
    const hay = `${m.name} ${m.group ?? ""} ${m.type ?? ""} ${m.legendary ?? ""} ${m.minion ? "minion" : ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

const PAGE = 60;

export function MonstersTab() {
  const book = useCampaign();
  const monsters = book.get().monsters;
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [bookFilter, setBookFilter] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const fileInput = useRef<HTMLInputElement>(null);
  const books = useMemo(() => [...new Set(monsters.map(bookOf))].sort(), [monsters]);

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    const hp = whole(d.hp);
    const hpPerHero = whole(d.hpPerHero);
    const lastStand = whole(d.lastStandHpPerHero);
    const monster: Monster = {
      id: editing.id ?? `monster.${book.newId()}`,
      name: d.name.trim(),
      level: d.minion ? d.level.trim() || "1" : d.level.trim(),
      minion: d.minion,
      ...(d.size.trim() ? { size: d.size.trim() } : {}),
      ...(!d.minion && hp !== undefined ? { hp } : {}),
      armor: d.armor,
      ...(d.speed.trim() ? { speed: d.speed.trim() } : {}),
      ...(d.saves.trim() ? { saves: d.saves.trim() } : {}),
      abilities: parseAbilities(d.abilities),
      ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
      ...(d.source.trim() ? { source: d.source.trim() } : {}),
      ...(d.group.trim() ? { group: d.group.trim() } : {}),
      ...(d.type.trim() ? { type: d.type.trim() } : {}),
      ...(d.legendary ? { legendary: d.legendary } : {}),
      ...(d.legendary && hpPerHero !== undefined ? { hpPerHero } : {}),
      ...(d.legendary && lastStand !== undefined ? { lastStandHpPerHero: lastStand } : {}),
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
    const skipped = plan.skipped.length ? ` ${plan.skipped.length} couldn't be read and were left out: ${plan.skipped.slice(0, 5).map((s) => s.name).join(", ")}${plan.skipped.length > 5 ? "…" : ""}.` : "";
    setMessage(`Loaded ${plan.monsters.length} monsters (${plan.added} new, ${plan.replaced} updated).${skipped}`);
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
        {!d.minion && (
          <div className="row">
            <label className="field">
              Legendary?
              <select value={d.legendary} onChange={(e) => set({ legendary: e.target.value as Draft["legendary"] })}>
                <option value="">No</option>
                <option value="Legendary">Legendary</option>
                <option value="Solo">Solo</option>
              </select>
            </label>
            {d.legendary && (
              <>
                <label className="field">
                  HP per hero
                  <input className="small-input" inputMode="numeric" value={d.hpPerHero} onChange={(e) => set({ hpPerHero: e.target.value })} />
                </label>
                <label className="field">
                  Last Stand HP per hero
                  <input className="small-input" inputMode="numeric" value={d.lastStandHpPerHero} onChange={(e) => set({ lastStandHpPerHero: e.target.value })} />
                </label>
              </>
            )}
          </div>
        )}
        <label className="field">
          Abilities (one per line: “Name. What it does”)
          <textarea rows={5} value={d.abilities} onChange={(e) => set({ abilities: e.target.value })} />
        </label>
        <label className="field">
          Notes and tactics (optional)
          <textarea rows={3} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <div className="row">
          <label className="field">
            Group (optional)
            <input value={d.group} onChange={(e) => set({ group: e.target.value })} placeholder="Kobolds" />
          </label>
          <label className="field">
            Type (optional)
            <input value={d.type} onChange={(e) => set({ type: e.target.value })} />
          </label>
        </div>
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

  const shown = searchMonsters(monsters, filter, bookFilter);
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
      {monsters.length > 6 && (
        <div className="row">
          <input
            aria-label="Find a monster"
            placeholder="Find by name, group or type…"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLimit(PAGE);
            }}
          />
          {books.length > 1 && (
            <select aria-label="Book" value={bookFilter} onChange={(e) => setBookFilter(e.target.value)}>
              <option value="">All books</option>
              {books.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {monsters.length === 0 && <p className="small">No monsters yet.</p>}
      {monsters.length > 6 && <p className="small">{shown.length === monsters.length ? `${monsters.length} monsters` : `${shown.length} of ${monsters.length} monsters`}</p>}
      <ul className="rows">
        {shown.slice(0, limit).map((m) => (
          <li key={m.id} className="row-item">
            <details>
              <summary>
                <span className="row-name">{m.name}</span>
                <span className="row-meta">{monsterLine(m)}</span>
              </summary>
              <MonsterDetails m={m} />
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
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit(limit + PAGE)}>
          Show more ({shown.length - limit} left)
        </button>
      )}
    </div>
  );
}
