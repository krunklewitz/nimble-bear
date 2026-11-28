import { useEffect, useRef, useState } from "react";
import type { CampaignImport } from "../../app/campaign";
import { downloadTextFile, readFileText } from "../../platform/files";
import { useCampaign } from "./CampaignContext";

export function CampaignTab() {
  const book = useCampaign();
  const campaign = book.get();
  const fileInput = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<CampaignImport | null>(null);
  const [message, setMessage] = useState("");
  const [hasPrevious, setHasPrevious] = useState(false);

  useEffect(() => {
    void book.hasPrevious().then(setHasPrevious);
  }, [book, campaign.revision]);

  const save = async () => {
    const file = await book.buildFile();
    downloadTextFile(file.fileName, file.text);
    await book.markSaved(file.checksum);
    setMessage(`Saved ${file.fileName}.`);
  };

  return (
    <div className="tab-body">
      <label className="field">
        Campaign name
        <input value={campaign.name} onChange={(e) => e.target.value.trim() && void book.update("Rename campaign", (d) => void (d.name = e.target.value))} />
      </label>
      <p className="small">
        {campaign.monsters.length} monsters · {campaign.encounters.length} encounters. Everything autosaves on this device; the campaign file is your backup and how you move it to another computer.
      </p>
      <div className="row">
        <button type="button" className="primary" onClick={() => void save()}>
          Save campaign file
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Load campaign file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void readFileText(f).then((t) => book.prepareImport(t)).then(setPlan);
          }}
        />
      </div>
      {book.isUnsaved() && <p className="small">There are changes since the campaign file was last saved.</p>}
      {message && <p className="small" role="status">{message}</p>}

      {plan?.kind === "invalid" && <p className="banner error">{plan.error}</p>}
      {plan?.kind === "monsters" && (
        <div className="note">
          <p>
            This is a monster file: {plan.monsters.length} monsters ({plan.added} new, {plan.replaced} replacing ones with the same id).
          </p>
          {plan.skipped.length > 0 && (
            <p className="small">
              ⚠ {plan.skipped.length} couldn't be read and will be left out: {plan.skipped.slice(0, 5).map((x) => x.name).join(", ")}
              {plan.skipped.length > 5 ? "…" : ""}
            </p>
          )}
          <button
            type="button"
            className="primary"
            onClick={() =>
              void book.addMonsters(plan.monsters).then(() => {
                setPlan(null);
                setMessage(`Loaded ${plan.monsters.length} monsters.`);
              })
            }
          >
            Add them
          </button>{" "}
          <button type="button" onClick={() => setPlan(null)}>
            Cancel
          </button>
        </div>
      )}
      {plan?.kind === "campaign" && (
        <div className="note">
          <p>
            <strong>{plan.campaign.name}</strong>: {plan.campaign.monsters.length} monsters, {plan.campaign.encounters.length} encounters
            {plan.savedAt ? `, saved ${new Date(plan.savedAt).toLocaleString()}` : ""}.
          </p>
          {!plan.checksumMatches && <p className="small">⚠ The file's fingerprint doesn't match its contents (it was edited or damaged). It is still valid.</p>}
          <p className="small">
            Loading replaces the campaign on this device.{plan.localUnsaved ? " This device has changes that aren't in any saved file." : ""} The current one is kept as a backup you can bring back below.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() =>
              void book.useCampaign(plan.campaign, plan.checksum).then(() => {
                setPlan(null);
                setMessage(`Loaded ${plan.campaign.name}.`);
              })
            }
          >
            Replace with the file
          </button>{" "}
          <button type="button" onClick={() => setPlan(null)}>
            Keep this device's
          </button>
        </div>
      )}

      {hasPrevious && (
        <p>
          <button
            type="button"
            className="link"
            onClick={() => window.confirm("Swap the current campaign with the backup kept before the last load?") && void book.restorePrevious().then((ok) => setMessage(ok ? "Backup restored (the other copy is now the backup)." : "The backup couldn't be read."))}
          >
            Bring back the previous campaign
          </button>
        </p>
      )}
    </div>
  );
}
