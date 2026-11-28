import { useEffect, useMemo, useRef, useState } from "react";
import { getContent } from "../data/content";
import type { ChoiceDefT, StatId } from "../data/schema";
import { STAT_IDS } from "../data/schema";
import { availableClasses, choicesIn, createCharacter, validateCreation, type CreationInput, type Problem } from "../rules/build";
import { derive } from "../rules/derive";
import { ChoicePicker, FeatureCard, SourceTag, signed, type ChoiceOption } from "./common";
import { useLibrary } from "./LibraryContext";

const STEPS = ["class", "ancestry", "background", "stats", "skills", "languages", "equipment", "name"] as const;
type Step = (typeof STEPS)[number];
const STEP_TITLE: Record<Step, string> = {
  class: "Class",
  ancestry: "Ancestry",
  background: "Background",
  stats: "Stats",
  skills: "Skills",
  languages: "Languages",
  equipment: "Equipment",
  name: "Name & review",
};
const DRAFT_KEY = "creationDraft";

const empty = (): CreationInput => ({
  name: "",
  classId: "",
  ancestryId: "",
  ancestryChoices: {},
  backgroundId: "",
  backgroundChoices: {},
  statArrayId: "",
  assign: {},
  skillPoints: {},
  languages: [],
  kit: "class",
});

interface Draft {
  step: Step;
  input: CreationInput;
}

export function CreationWizard({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const content = getContent();
  const { library } = useLibrary();
  const [draft, setDraft] = useState<Draft | null>(null);
  const loaded = useRef(false);

  // Resume a saved draft.
  useEffect(() => {
    void library.getSetting(DRAFT_KEY).then((raw) => {
      loaded.current = true;
      try {
        const parsed = raw ? (JSON.parse(raw) as Draft) : null;
        setDraft(parsed && STEPS.includes(parsed.step) ? { step: parsed.step, input: { ...empty(), ...parsed.input } } : { step: "class", input: empty() });
      } catch {
        setDraft({ step: "class", input: empty() });
      }
    });
  }, [library]);

  useEffect(() => {
    if (draft && loaded.current) void library.putSetting(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, library]);

  const problems = useMemo(() => (draft ? validateCreation(content, draft.input) : []), [content, draft]);
  if (!draft) return <p className="screen" role="status">Loading…</p>;
  const { input, step } = draft;
  const set = (patch: Partial<CreationInput>) => setDraft({ step, input: { ...input, ...patch } });
  const go = (s: Step) => setDraft({ step: s, input });
  const i = STEPS.indexOf(step);
  const stepProblems = (s: Step): Problem[] => problems.filter((p) => p.step === s);
  const ready = problems.length === 0;

  const finish = async () => {
    const c = createCharacter(content, input, library.newId(), new Date().toISOString());
    const id = await library.add(c);
    await library.putSetting(DRAFT_KEY, "");
    onDone(id);
  };

  return (
    <section className="screen wizard" aria-labelledby="wiz-title">
      <div className="row">
        <button type="button" className="link" onClick={onCancel}>
          ← Characters
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setDraft({ step: "class", input: empty() });
          }}
        >
          Start over
        </button>
      </div>
      <h1 id="wiz-title">New hero: {STEP_TITLE[step]}</h1>
      <ol className="steps" aria-label="Steps">
        {STEPS.map((s, n) => (
          <li key={s}>
            <button type="button" className={`step ${s === step ? "current" : ""} ${stepProblems(s).length === 0 && n < i ? "done" : ""}`} onClick={() => go(s)} aria-current={s === step}>
              {n + 1}
            </button>
          </li>
        ))}
      </ol>

      {step === "class" && <ClassStep input={input} set={set} />}
      {step === "ancestry" && <AncestryStep input={input} set={set} />}
      {step === "background" && <BackgroundStep input={input} set={set} />}
      {step === "stats" && <StatsStep input={input} set={set} />}
      {step === "skills" && <SkillsStep input={input} set={set} />}
      {step === "languages" && <LanguagesStep input={input} set={set} />}
      {step === "equipment" && <EquipmentStep input={input} set={set} />}
      {step === "name" && <ReviewStep input={input} set={set} problems={problems} go={go} />}

      {stepProblems(step).length > 0 && step !== "name" && (
        <ul className="problems">
          {stepProblems(step).map((p) => (
            <li key={p.message}>{p.message}</li>
          ))}
        </ul>
      )}
      <div className="row wizard-nav">
        <button type="button" disabled={i === 0} onClick={() => go(STEPS[i - 1] ?? "class")}>
          Back
        </button>
        {step !== "name" ? (
          <button type="button" className="primary" disabled={stepProblems(step).length > 0} onClick={() => go(STEPS[i + 1] ?? "name")}>
            Next
          </button>
        ) : (
          <button type="button" className="primary" disabled={!ready} onClick={() => void finish()}>
            Create hero
          </button>
        )}
      </div>
    </section>
  );
}

interface StepProps {
  input: CreationInput;
  set: (patch: Partial<CreationInput>) => void;
}

function ClassStep({ input, set }: StepProps) {
  const content = getContent();
  return (
    <div>
      <p className="small">This shapes your hero the most. Only classes from the books provided are offered.</p>
      {availableClasses(content).map((c) => (
        <label key={c.id} className={`option big ${input.classId === c.id ? "selected" : ""}`}>
          <input
            type="radio"
            name="class"
            checked={input.classId === c.id}
            // A new class changes Key Stats and gear: clear stats and skills.
            onChange={() => set({ classId: c.id, statArrayId: "", assign: {}, kit: "class" })}
          />
          <span>
            <strong>{c.name}</strong>
            <span className="small option-detail">
              Key Stats {c.keyStats.join(", ")} · Hit Die {c.hitDie} · Starting HP {c.startingHp} · Saves {c.saves.advantaged}▲ {c.saves.disadvantaged}▼
            </span>
            <span className="small option-detail">
              Armor: {c.armorText} · Weapons: {c.weaponsText}
            </span>
            <SourceTag source={c.source} />
          </span>
        </label>
      ))}
      {input.classId && <LevelOnePreview classId={input.classId} />}
    </div>
  );
}

function LevelOnePreview({ classId }: { classId: string }) {
  const cls = getContent().classes.get(classId);
  if (!cls) return null;
  const ids = cls.levels["1"] ?? [];
  return (
    <div className="panel">
      <h2>Level 1 features</h2>
      {ids.map((id) => {
        const f = cls.features.find((x) => x.id === id);
        return f ? <FeatureCard key={id} feature={f} /> : null;
      })}
    </div>
  );
}

function saveCandidates(classId: string, from: "neutral" | "disadvantaged"): StatId[] {
  const cls = getContent().classes.get(classId);
  if (!cls) return [];
  if (from === "disadvantaged") return [cls.saves.disadvantaged];
  return STAT_IDS.filter((s) => s !== cls.saves.advantaged && s !== cls.saves.disadvantaged);
}

function optionsForChoice(choice: ChoiceDefT, classId: string): ChoiceOption[] {
  const content = getContent();
  const from = choice.from;
  switch (from.kind) {
    case "size":
      return from.sizes.map((s) => ({ id: s, label: s[0]?.toUpperCase() + s.slice(1) }));
    case "save":
      return saveCandidates(classId, from.from === "neutral" ? "neutral" : "disadvantaged").map((s) => ({ id: s, label: `${s} save` }));
    case "spell":
      return [...content.spells.values()]
        .filter((s) => s.tier === from.tier && (!from.school || s.school === from.school))
        .map((s) => ({ id: s.id, label: `${s.name} (${s.school})`, detail: s.text }));
    case "options":
      return from.options.map((o) => ({ id: o.id, label: o.label }));
    case "stat":
      return from.stats.map((s) => ({ id: s, label: s }));
    default:
      return [];
  }
}

function FeatureChoices({ features, values, onChange, classId }: { features: Parameters<typeof choicesIn>[0]; values: Record<string, string[]>; onChange: (v: Record<string, string[]>) => void; classId: string }) {
  return (
    <>
      {choicesIn(features)
        .filter(({ choice }) => !(choice.from.kind === "save" && choice.from.from === "disadvantaged"))
        .map(({ choice }) => (
          <ChoicePicker key={choice.id} choice={choice} options={optionsForChoice(choice, classId)} value={values[choice.id] ?? []} onChange={(v) => onChange({ ...values, [choice.id]: v })} />
        ))}
    </>
  );
}

function AncestryStep({ input, set }: StepProps) {
  const content = getContent();
  const groups = ["common", "uncommon", "exotic"] as const;
  const chosen = content.ancestries.get(input.ancestryId);
  return (
    <div>
      <p className="small">Uncommon and exotic ancestries depend on your setting: check with your GM.</p>
      {groups.map((g) => (
        <details key={g} open={g === "common" || chosen?.rarity === g}>
          <summary>{g[0]?.toUpperCase() + g.slice(1)} ancestries</summary>
          {[...content.ancestries.values()]
            .filter((a) => a.rarity === g)
            .map((a) => (
              <label key={a.id} className={`option ${input.ancestryId === a.id ? "selected" : ""}`}>
                <input type="radio" name="ancestry" checked={input.ancestryId === a.id} onChange={() => set({ ancestryId: a.id, ancestryChoices: {} })} />
                <span>
                  <strong>{a.name}</strong> <span className="small">({a.sizes.join(" or ")})</span>
                  {a.features.map((f) => (
                    <span key={f.id} className="small option-detail">
                      <strong>{f.name}.</strong> {f.text}
                    </span>
                  ))}
                </span>
              </label>
            ))}
        </details>
      ))}
      {chosen && (
        <div className="panel">
          <h2>{chosen.name}</h2>
          <p className="small">{chosen.description}</p>
          {chosen.features.map((f) => (
            <FeatureCard key={f.id} feature={f} />
          ))}
          <FeatureChoices features={chosen.features} values={input.ancestryChoices} onChange={(v) => set({ ancestryChoices: v })} classId={input.classId} />
        </div>
      )}
    </div>
  );
}

function BackgroundStep({ input, set }: StepProps) {
  const content = getContent();
  const chosen = content.backgrounds.get(input.backgroundId);
  return (
    <div>
      <p className="small">Backgrounds marked “Req.” need that stat at 0 or lower; you'll set stats next.</p>
      {[...content.backgrounds.values()].map((b) => (
        <label key={b.id} className={`option ${input.backgroundId === b.id ? "selected" : ""}`}>
          <input type="radio" name="background" checked={input.backgroundId === b.id} onChange={() => set({ backgroundId: b.id, backgroundChoices: {} })} />
          <span>
            <strong>{b.name}</strong>
            {b.requires && <span className="badge pending"> Req. {b.requires.stat} ≤ {b.requires.max}</span>}
            <span className="small option-detail">{b.features.map((f) => f.text).join(" ")}</span>
          </span>
        </label>
      ))}
      {chosen && (
        <div className="panel">
          <h2>{chosen.name}</h2>
          {chosen.features.map((f) => (
            <FeatureCard key={f.id} feature={f} />
          ))}
          <FeatureChoices features={chosen.features} values={input.backgroundChoices} onChange={(v) => set({ backgroundChoices: v })} classId={input.classId} />
        </div>
      )}
    </div>
  );
}

function StatsStep({ input, set }: StepProps) {
  const content = getContent();
  const cls = content.classes.get(input.classId);
  const array = content.core.statArrays.find((a) => a.id === input.statArrayId);
  if (!cls) return <p>Choose a class first.</p>;
  const assignFor = (values: readonly number[]): Partial<Record<StatId, number>> => {
    // Default placement: the highest values in the Key Stats, then the rest in order.
    const sorted = [...values].sort((a, b) => b - a);
    const order: StatId[] = [cls.keyStats[0], cls.keyStats[1], ...STAT_IDS.filter((s) => !cls.keyStats.includes(s))];
    return Object.fromEntries(order.map((s, n) => [s, sorted[n] ?? 0]));
  };
  const swap = (a: StatId, b: StatId) => set({ assign: { ...input.assign, [a]: input.assign[b], [b]: input.assign[a] } });
  return (
    <div>
      <p className="small">
        Pick an array (Core Rules p.20). The highest values go in your Key Stats ({cls.keyStats.join(" and ")}); you can swap values between Key Stats or between the other two.
      </p>
      {content.core.statArrays.map((a) => (
        <label key={a.id} className={`option ${input.statArrayId === a.id ? "selected" : ""}`}>
          <input type="radio" name="array" checked={input.statArrayId === a.id} onChange={() => set({ statArrayId: a.id, assign: assignFor(a.values) })} />
          <span>
            <strong>{a.name}</strong> <span className="small">{a.values.map(signed).join(", ")}</span>
          </span>
        </label>
      ))}
      {array && (
        <table className="stats-table">
          <tbody>
            {STAT_IDS.map((s) => (
              <tr key={s}>
                <th scope="row">
                  {s} {cls.keyStats.includes(s) ? <span className="badge pass">Key</span> : null}
                </th>
                <td>{signed(input.assign[s] ?? 0)}</td>
                <td>
                  {STAT_IDS.filter((o) => o !== s && cls.keyStats.includes(o) === cls.keyStats.includes(s) && input.assign[o] !== input.assign[s]).map((o) => (
                    <button key={o} type="button" onClick={() => swap(s, o)}>
                      Swap with {o}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SkillsStep({ input, set }: StepProps) {
  const content = getContent();
  const total = Object.values(input.skillPoints).reduce((s, v) => s + v, 0);
  const left = content.core.defaults.startingSkillPoints - total;
  const ancestryMods = new Map<string, number>();
  for (const f of content.ancestries.get(input.ancestryId)?.features ?? []) {
    for (const e of f.effects) {
      if (e.type === "modifier" && e.op === "add" && /^\d+$/.test(e.value)) {
        if (e.target === "skills.all") for (const sk of content.core.skills) ancestryMods.set(sk.id, (ancestryMods.get(sk.id) ?? 0) + Number(e.value));
        else if (e.target.startsWith("skill.")) ancestryMods.set(e.target.slice(6), (ancestryMods.get(e.target.slice(6)) ?? 0) + Number(e.value));
      }
    }
  }
  const change = (id: string, d: number) => {
    const v = (input.skillPoints[id] ?? 0) + d;
    if (v < 0 || (d > 0 && left <= 0)) return;
    set({ skillPoints: { ...input.skillPoints, [id]: v } });
  };
  return (
    <div>
      <p className="small">
        Each skill starts at its stat. Spend 4 skill points (Core Rules p.56). Points left: <strong>{left}</strong>
      </p>
      <table className="stats-table">
        <tbody>
          {content.core.skills.map((sk) => {
            const pts = input.skillPoints[sk.id] ?? 0;
            const totalSkill = (input.assign[sk.stat] ?? 0) + pts + (ancestryMods.get(sk.id) ?? 0);
            return (
              <tr key={sk.id}>
                <th scope="row">
                  {sk.name} <span className="small">({sk.stat})</span>
                </th>
                <td>
                  <button type="button" aria-label={`Remove a point from ${sk.name}`} onClick={() => change(sk.id, -1)} disabled={pts === 0}>
                    −
                  </button>{" "}
                  {pts}{" "}
                  <button type="button" aria-label={`Add a point to ${sk.name}`} onClick={() => change(sk.id, 1)} disabled={left <= 0}>
                    +
                  </button>
                </td>
                <td>
                  <strong>{signed(totalSkill)}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LanguagesStep({ input, set }: StepProps) {
  const content = getContent();
  const slots = Math.max(0, input.assign.INT ?? 0);
  const fromAncestry = new Set<string>();
  for (const f of content.ancestries.get(input.ancestryId)?.features ?? []) for (const e of f.effects) if (e.type === "proficiency") for (const l of e.languages ?? []) fromAncestry.add(l);
  return (
    <div>
      <p className="small">
        Everyone speaks Common. Each point of INT grants another language (Core Rules p.20). You can pick <strong>{slots}</strong>.
        {fromAncestry.size > 0 && ` Your ancestry already gives: ${[...fromAncestry].map((l) => content.core.languages.find((x) => x.id === l)?.name ?? l).join(", ")} (if your INT isn't negative).`}
      </p>
      {content.core.languages
        .filter((l) => l.id !== "common")
        .map((l) => {
          const on = input.languages.includes(l.id);
          return (
            <label key={l.id} className={`option ${on ? "selected" : ""}`}>
              <input
                type="checkbox"
                checked={on}
                disabled={!on && input.languages.length >= slots}
                onChange={() => set({ languages: on ? input.languages.filter((x) => x !== l.id) : [...input.languages, l.id] })}
              />
              <span>
                <strong>{l.name}</strong> <span className="small">{l.spokenBy}</span>
              </span>
            </label>
          );
        })}
    </div>
  );
}

function EquipmentStep({ input, set }: StepProps) {
  const content = getContent();
  const cls = content.classes.get(input.classId);
  return (
    <div>
      <p className="small">Start with your class's gear, or 50 gp to buy your own (Core Rules p.20).</p>
      <label className={`option ${input.kit === "class" ? "selected" : ""}`}>
        <input type="radio" name="kit" checked={input.kit === "class"} onChange={() => set({ kit: "class" })} />
        <span>
          <strong>Class gear</strong> <span className="small option-detail">{cls?.startingGearText ?? "Choose a class first."}</span>
        </span>
      </label>
      <label className={`option ${input.kit === "gold" ? "selected" : ""}`}>
        <input type="radio" name="kit" checked={input.kit === "gold"} onChange={() => set({ kit: "gold" })} />
        <span>
          <strong>50 gp</strong> <span className="small option-detail">Add items later on the Gear tab.</span>
        </span>
      </label>
    </div>
  );
}

function ReviewStep({ input, set, problems, go }: StepProps & { problems: Problem[]; go: (s: Step) => void }) {
  const content = getContent();
  const preview = useMemo(() => {
    try {
      return derive(content, createCharacter(content, input, "preview", new Date().toISOString()));
    } catch {
      return null;
    }
  }, [content, input]);
  return (
    <div>
      <label className="field">
        Hero name
        <input value={input.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} autoFocus />
      </label>
      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((p) => (
            <li key={p.message}>
              {p.message}{" "}
              <button type="button" className="link" onClick={() => go(p.step)}>
                Fix
              </button>
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <div className="panel">
          <h2>Preview</h2>
          <p>
            {preview.ancestry?.name} {preview.cls?.name}, level 1 · HP {preview.hp.max} · Defense {preview.defense.value} · Initiative {signed(preview.initiative.mod)} · Speed {preview.speed}
          </p>
          <p className="small">
            {STAT_IDS.map((s) => `${s} ${signed(preview.stats[s])}`).join(" · ")} · Hit Die {preview.hitDice.die} · Save DC {preview.saveDc}
          </p>
        </div>
      )}
    </div>
  );
}
