import { useState } from "react";
import { getContent } from "../data/content";
import { applyLevelUp, levelUpPlan, validateLevelUp, type LevelUpInput } from "../rules/build";
import { derive } from "../rules/derive";
import { dropIndexes } from "../rules/dice";
import { downloadTextFile } from "../platform/files";
import { cryptoRng } from "../platform/random";
import { ChoicePicker, FeatureCard, signed, type ChoiceOption } from "./common";
import { useLibrary } from "./LibraryContext";

/** Guided level-up (Core Rules p.21). Takes a snapshot first; offers to save a file after. */
export function LevelUpWizard({ id, onDone }: { id: string; onDone: () => void }) {
  const content = getContent();
  const { library } = useLibrary();
  const entry = library.get(id);
  const character = entry?.status === "ok" ? entry.character : null;
  const [hp, setHp] = useState<LevelUpInput["hp"] | null>(null);
  const [rolled, setRolled] = useState<number[] | null>(null);
  const [addSkill, setAddSkill] = useState("");
  const [moveOn, setMoveOn] = useState(false);
  const [move, setMove] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [done, setDone] = useState(false);
  if (!character) return <p className="screen">Character not found.</p>;
  const sheet = derive(content, character);
  const plan = levelUpPlan(content, character, sheet);
  if (!plan) return <p className="screen">This hero can't level up further yet.</p>;

  const sides = Number(plan.hitDie.slice(1));
  const input: LevelUpInput = { hp: hp ?? { method: "average", value: plan.average }, addSkill, move: moveOn ? move : undefined, choices };
  const problems = hp ? validateLevelUp(content, character, plan, input, sheet) : ["Choose how to raise your max HP."];

  // Options for each choice, worked out against the hero as they'll be with the choices so far.
  const optionsFor = (choiceId: string): ChoiceOption[] => {
    const trial = structuredClone(character);
    trial.build.levels.push({ level: plan.level, classId: trial.build.levels[0]?.classId ?? "", hp: { method: "average", value: plan.average }, skillPoints: {}, choices });
    const pc = derive(content, trial).choices.find((c) => c.choice.id === choiceId);
    const sub = (oid: string) => content.subclasses.get(oid);
    return (pc?.options ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      detail: sub(o.id) ? `${sub(o.id)?.tagline ?? ""}${sub(o.id)?.storyBased ? " (story-based)" : ""}` : content.spells.get(o.id)?.text,
    }));
  };

  const rollHp = () => {
    // "Roll your Hit Die with advantage" (p.21): 2 dice, keep the higher.
    const a = cryptoRng(sides);
    const b = cryptoRng(sides);
    const drop = dropIndexes([a, b], 1, "lowest");
    const kept = [a, b].filter((_, i) => !drop.has(i))[0] ?? a;
    setRolled([a, b]);
    setHp({ method: "roll", value: kept });
  };

  const confirm = async () => {
    await library.snapshotBeforeLevelUp(id);
    library.update(id, (d) => applyLevelUp(content, d, plan, input), `Level up to ${plan.level}`);
    setDone(true);
  };

  if (done) {
    return (
      <section className="screen">
        <h1>Level {plan.level}!</h1>
        <p>Save your character file now, so this level is safe on any computer.</p>
        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() =>
              void library.saveToFile(id).then(({ fileName, text }) => {
                downloadTextFile(fileName, text);
                onDone();
              })
            }
          >
            Save character file
          </button>
          <button type="button" onClick={onDone}>
            Later
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="screen wizard" aria-labelledby="lvl-title">
      <button type="button" className="link" onClick={onDone}>
        ← Cancel
      </button>
      <h1 id="lvl-title">
        Level up: {character.name} → level {plan.level}
      </h1>
      <p className="small">The GM may let you level up while Safe Resting (Core Rules p.21). You gain:</p>

      <div className="panel">
        <h2>New features</h2>
        {plan.features.length === 0 && <p className="small">No new class features this level.</p>}
        {plan.features.map((f) => (
          <FeatureCard key={f.id} feature={f} />
        ))}
      </div>

      <div className="panel">
        <h2>More HP</h2>
        <p className="small">
          Roll your Hit Die ({plan.hitDie}) with advantage, or take the average (+{plan.average}).
        </p>
        <div className="row">
          <button type="button" onClick={rollHp} disabled={hp?.method === "roll"}>
            Roll {plan.hitDie} with advantage
          </button>
          <button type="button" onClick={() => setHp({ method: "average", value: plan.average })} disabled={hp?.method === "roll"}>
            Take +{plan.average}
          </button>
        </div>
        {rolled && <p className="small">Rolled {rolled.join(" and ")}: keep {hp?.value}.</p>}
        {hp && (
          <p>
            Max HP {sheet.hp.max} → <strong>{sheet.hp.max + hp.value}</strong>. Max Hit Dice {sheet.hitDice.max} → {sheet.hitDice.max + 1}.
          </p>
        )}
      </div>

      <div className="panel">
        <h2>Skill point</h2>
        <label className="field">
          Add 1 point to
          <select value={addSkill} onChange={(e) => setAddSkill(e.target.value)}>
            <option value="">Choose a skill…</option>
            {sheet.skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({signed(s.total)})
              </option>
            ))}
          </select>
        </label>
        <label className="option compact">
          <input type="checkbox" checked={moveOn} onChange={(e) => setMoveOn(e.target.checked)} />
          <span>Also move 1 point from one skill to another (not from a negative skill)</span>
        </label>
        {moveOn && (
          <div className="row">
            <select value={move.from} onChange={(e) => setMove({ ...move, from: e.target.value })} aria-label="Move from">
              <option value="">From…</option>
              {sheet.skills.filter((s) => s.total >= 0).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({signed(s.total)})
                </option>
              ))}
            </select>
            <select value={move.to} onChange={(e) => setMove({ ...move, to: e.target.value })} aria-label="Move to">
              <option value="">To…</option>
              {sheet.skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {plan.choices.length > 0 && (
        <div className="panel">
          <h2>Choices</h2>
          {plan.choices.map(({ choice }) => (
            <ChoicePicker key={choice.id} choice={choice} options={optionsFor(choice.id)} value={choices[choice.id] ?? []} onChange={(v) => setChoices({ ...choices, [choice.id]: v })} />
          ))}
        </div>
      )}

      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <button type="button" className="primary" disabled={problems.length > 0} onClick={() => void confirm()}>
        Confirm level {plan.level}
      </button>
    </section>
  );
}

