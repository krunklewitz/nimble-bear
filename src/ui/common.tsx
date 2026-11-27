import type { ChoiceDefT, FeatureDefT, SourceRefT } from "../data/schema";

export function SourceTag({ source }: { source: SourceRefT }) {
  const book = source.file.replace(/\.pdf$/, "").replace(/(\d)/, " $1");
  return (
    <span className="source" title={source.note ?? ""}>
      {book} p.{source.printedPage}
      {source.status === "unverified" ? " · unverified" : ""}
    </span>
  );
}

export function FeatureCard({ feature, note }: { feature: FeatureDefT; note?: string | undefined }) {
  return (
    <div className="feature">
      <div className="feature-head">
        <strong>{feature.name}</strong>
        {feature.automation !== "full" && <span className={`badge ${feature.automation === "manual" ? "fail" : "pending"}`}>{feature.automation === "manual" ? "By hand" : "Partly by hand"}</span>}
      </div>
      <p className="feature-text">{feature.text}</p>
      {feature.manualNote && <p className="small">✋ {feature.manualNote}</p>}
      {note && <p className="small">{note}</p>}
      <SourceTag source={feature.source} />
    </div>
  );
}

export interface ChoiceOption {
  id: string;
  label: string;
  detail?: string | undefined;
}

/** Answers one choice: pick `count` options, or type free text. */
export function ChoicePicker({ choice, options, value, onChange }: { choice: ChoiceDefT; options: ChoiceOption[]; value: string[]; onChange: (v: string[]) => void }) {
  if (choice.from.kind === "text") {
    return (
      <label className="field">
        {choice.prompt}
        <input value={value[0] ?? ""} onChange={(e) => onChange(e.target.value.trim() ? [e.target.value] : [])} />
      </label>
    );
  }
  const toggle = (id: string) => {
    if (choice.count === 1) return onChange([id]);
    onChange(value.includes(id) ? value.filter((v) => v !== id) : value.length < choice.count ? [...value, id] : value);
  };
  return (
    <fieldset className="choice">
      <legend>
        {choice.prompt} {choice.count > 1 && <span className="small">(choose {choice.count})</span>}
      </legend>
      {options.length === 0 && <p className="small">No options available.</p>}
      {options.map((o) => (
        <label key={o.id} className={`option ${value.includes(o.id) ? "selected" : ""}`}>
          <input type={choice.count === 1 ? "radio" : "checkbox"} name={choice.id} checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
          <span>
            <strong>{o.label}</strong>
            {o.detail && <span className="small option-detail">{o.detail}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
