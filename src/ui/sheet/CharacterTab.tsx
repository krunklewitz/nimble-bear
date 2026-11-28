import { STAT_IDS } from "../../data/schema";
import { ChoicePicker, SourceTag, signed } from "../common";
import type { TabProps } from "./shared";

export function CharacterTab({ sheet, character, update, onRoll }: TabProps) {
  const unanswered = sheet.choices.filter((c) => c.selected.length < c.choice.count && c.choice.from.kind !== "save" && typeof c.where === "number");
  const groups = [
    { src: "class" as const, title: `Class Features (${sheet.cls?.name ?? ""})` },
    { src: "subclass" as const, title: `Subclass Features (${sheet.subclass?.name ?? ""})` },
    { src: "ancestry" as const, title: `Ancestry (${sheet.ancestry?.name ?? ""})` },
    { src: "background" as const, title: `Background (${sheet.background?.name ?? ""})` },
  ];
  return (
    <div>
      {unanswered.length > 0 && (
        <section className="card attention">
          <h2>Choices to make</h2>
          {unanswered.map((c) => (
            <ChoicePicker
              key={c.choice.id}
              choice={c.choice}
              options={c.options}
              value={c.selected}
              onChange={(v) =>
                update(`Choose: ${c.choice.prompt}`, (d) => {
                  const rec = d.build.levels.find((l) => l.level === c.where);
                  if (rec) rec.choices[c.choice.id] = v;
                })
              }
            />
          ))}
        </section>
      )}

      <h2>Stats &amp; saves</h2>
      <p className="small">Tap a save to roll it. ▲ advantage · ▼ disadvantage.</p>
      <div className="stat-grid">
        {STAT_IDS.map((s) => {
          const save = sheet.saves[s];
          const key = sheet.cls?.keyStats.includes(s);
          return (
            <button key={s} type="button" className={`stat ${key ? "key" : ""}`} onClick={() => onRoll({ kind: "save", label: `${s} save`, modifier: save.mod, baseAdvantage: save.advantage, stat: s })}>
              <span className="stat-name">{s}</span>
              <span className="stat-value">{signed(sheet.stats[s])}</span>
              <span className="small">
                Save {save.advantage > 0 ? "▲" : save.advantage < 0 ? "▼" : ""}
              </span>
            </button>
          );
        })}
      </div>
      <p className="small">
        Speed {sheet.speed} · Initiative {signed(sheet.initiative.mod)} · Size {sheet.size} · Save DC {sheet.saveDc} · KEY {signed(sheet.key)}
      </p>

      <h2>Skills</h2>
      <div className="skill-grid">
        {sheet.skills.map((sk) => (
          <button key={sk.id} type="button" className="skill" onClick={() => onRoll({ kind: "check", label: `${sk.name} check`, modifier: sk.total, skill: sk.id, stat: sk.stat })}>
            <span>
              {sk.name} <span className="small">{sk.stat}</span>
            </span>
            <strong>{signed(sk.total)}</strong>
          </button>
        ))}
      </div>

      <h2>Features</h2>
      {groups.map(({ src, title }) => {
        const list = sheet.features.filter((f) => f.source === src);
        if (!list.length) return null;
        return (
          <details key={src} className="spell-group" open={src === "class"}>
            <summary>
              <span>{title}</span>
              <span className="row-meta">
                {list.length} feature{list.length === 1 ? "" : "s"}
              </span>
            </summary>
            <ul className="rows">
              {list.map((f) => (
                <li key={f.def.id} className={`row-item ${f.replacedBy ? "replaced" : ""}`}>
                  <details>
                    <summary>
                      <span className="row-name">{f.def.name}</span>
                      <span className="row-meta">
                        {f.level ? `Lv ${f.level}` : ""}
                        {f.def.automation !== "full" ? (f.def.automation === "manual" ? " · by hand" : " · partly by hand") : ""}
                        {f.replacedBy ? " · replaced" : ""}
                      </span>
                    </summary>
                    <p className="small feature-text">{f.def.text}</p>
                    {f.def.manualNote && <p className="small">✋ {f.def.manualNote}</p>}
                    <SourceTag source={f.def.source} />
                  </details>
                </li>
              ))}
            </ul>
          </details>
        );
      })}

      <p className="small">
        Languages: {sheet.languages.join(", ")}
        {character.build.languages.length < sheet.extraLanguageSlots ? ` · you can learn ${sheet.extraLanguageSlots - character.build.languages.length} more` : ""}
      </p>
    </div>
  );
}
