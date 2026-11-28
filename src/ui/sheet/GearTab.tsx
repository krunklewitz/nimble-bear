import { useState } from "react";
import { getContent } from "../../data/content";
import { itemInfo } from "../../rules/items";
import { SourceTag } from "../common";
import type { TabProps } from "./shared";

export function GearTab({ sheet, character, update }: Omit<TabProps, "onRoll">) {
  const content = getContent();
  const [pick, setPick] = useState("");
  const catalog = [
    ...[...content.weapons.values()].filter((w) => w.id !== "weapon.unarmed-strike").map((x) => ({ id: x.id, name: x.name, group: "Weapons" })),
    ...[...content.armor.values()].map((x) => ({ id: x.id, name: x.name, group: "Armor" })),
    ...[...content.shields.values()].map((x) => ({ id: x.id, name: x.name, group: "Shields" })),
    ...[...content.gear.values()].map((x) => ({ id: x.id, name: x.name, group: "Gear" })),
  ];
  const groups = [...new Set(catalog.map((c) => c.group))];
  const picked = pick ? itemInfo(content, pick, pick, sheet) : null;

  return (
    <div>
      <p className="small">
        Inventory slots {sheet.inventorySlots.used}/{sheet.inventorySlots.max}
        {sheet.inventorySlots.used > sheet.inventorySlots.max ? " · over your limit" : ""} (Core Rules p.20).
      </p>
      <ul className="rows">
        {character.play.inventory.map((it, i) => {
          const info = itemInfo(content, it.itemId, it.name, sheet);
          const wearable = info.kind === "weapon" || info.kind === "armor" || info.kind === "shield";
          return (
            <li key={`${it.itemId ?? it.name}-${i}`} className="row-item">
              <details>
                <summary>
                  <span className="row-name">
                    {it.name}
                    {it.qty > 1 ? ` ×${it.qty}` : ""}
                    {info.warnings.length > 0 ? " ⚠" : ""}
                  </span>
                  <span className="row-meta">{info.summary}</span>
                </summary>
                {info.warnings.map((w) => (
                  <p key={w} className="small warn">
                    ⚠ {w}
                  </p>
                ))}
                {info.facts.map((f) => (
                  <p key={f} className="small">
                    {f}
                  </p>
                ))}
                {info.rules.length > 0 && (
                  <div className="rules-box">
                    <p className="small">
                      <strong>Rules from the book</strong>
                    </p>
                    {info.rules.map((r) => (
                      <div key={r.id} className="rule">
                        <p className="small">
                          <strong>{r.name}</strong>
                          {r.optional ? " (optional rule)" : ""}
                        </p>
                        <p className="small feature-text">{r.text}</p>
                        <SourceTag source={r.source} />
                      </div>
                    ))}
                  </div>
                )}
                {info.source && <SourceTag source={info.source} />}
                <div className="row">
                  <button type="button" className="mini" aria-label={`One fewer ${it.name}`} onClick={() => update(`${it.name} −1`, (d) => {
                    const row = d.play.inventory[i];
                    if (!row) return;
                    if (row.qty <= 1) d.play.inventory.splice(i, 1);
                    else row.qty -= 1;
                  })}>
                    −
                  </button>
                  <button type="button" className="mini" aria-label={`One more ${it.name}`} onClick={() => update(`${it.name} +1`, (d) => void ((d.play.inventory[i] as { qty: number }).qty += 1))}>
                    +
                  </button>
                </div>
              </details>
              {wearable && (
                <label className="equip">
                  <input type="checkbox" checked={it.equipped} onChange={() => update(`${it.equipped ? "Unequip" : "Equip"} ${it.name}`, (d) => void ((d.play.inventory[i] as { equipped: boolean }).equipped = !it.equipped))} />
                  <span className="small">{info.kind === "weapon" ? "ready" : "worn"}</span>
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <h2>Add an item</h2>
      <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Choose an item">
        <option value="">Choose…</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {catalog
              .filter((c) => c.group === g)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {picked && (
        <div className="card">
          <strong>{picked.name}</strong> <span className="small">{picked.summary}</span>
          {picked.facts.map((f) => (
            <p key={f} className="small">
              {f}
            </p>
          ))}
          {picked.warnings.map((w) => (
            <p key={w} className="small warn">
              ⚠ {w}
            </p>
          ))}
          <button
            type="button"
            className="primary"
            onClick={() => {
              update(`Add ${picked.name}`, (d) => void d.play.inventory.push({ itemId: picked.id, name: picked.name, qty: 1, equipped: false, notes: "" }));
              setPick("");
            }}
          >
            Add {picked.name}
          </button>
        </div>
      )}

      <label className="field">
        Gold (gp)
        <input type="number" min={0} value={character.play.gold} onChange={(e) => update("Change gold", (d) => void (d.play.gold = Math.max(0, Number(e.target.value) || 0)))} />
      </label>
    </div>
  );
}
