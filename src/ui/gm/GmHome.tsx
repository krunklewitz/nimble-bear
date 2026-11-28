import { useState } from "react";
import { CampaignProvider, useCampaign } from "./CampaignContext";
import { CampaignTab } from "./CampaignTab";
import { EncountersTab } from "./EncountersTab";
import { MonstersTab } from "./MonstersTab";
import { TrackerTab } from "./TrackerTab";

type Tab = "tracker" | "encounters" | "monsters" | "campaign";
const TABS: { id: Tab; label: string }[] = [
  { id: "tracker", label: "Tracker" },
  { id: "encounters", label: "Encounters" },
  { id: "monsters", label: "Monsters" },
  { id: "campaign", label: "Campaign" },
];

export function GmHome({ version, onBack }: { version: string; onBack: () => void }) {
  return (
    <CampaignProvider version={version}>
      <GmTabs onBack={onBack} />
    </CampaignProvider>
  );
}

function GmTabs({ onBack }: { onBack: () => void }) {
  const book = useCampaign();
  const [tab, setTab] = useState<Tab>(book.get().tracker.active ? "tracker" : "encounters");
  const undo = book.canUndo();

  return (
    <section className="screen gm" aria-labelledby="gm-title">
      <div className="row space">
        <button type="button" className="link" onClick={onBack}>
          ← Characters
        </button>
        <span className="row">
          {undo && (
            <button type="button" className="mini" title={`Undo: ${undo}`} aria-label={`Undo: ${undo}`} onClick={() => void book.undoLast()}>
              ↶
            </button>
          )}
          <span className={`badge ${book.isUnsaved() ? "pending" : "pass"}`}>{book.isUnsaved() ? "Unsaved" : "Saved"}</span>
        </span>
      </div>
      <h1 id="gm-title">GM tools</h1>
      {book.loadError && <p className="banner error">{book.loadError}</p>}
      <nav className="tabs" role="tablist" aria-label="GM sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "current" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "tracker" && <TrackerTab onPlan={() => setTab("encounters")} />}
      {tab === "encounters" && <EncountersTab onStarted={() => setTab("tracker")} onMonsters={() => setTab("monsters")} />}
      {tab === "monsters" && <MonstersTab />}
      {tab === "campaign" && <CampaignTab />}
    </section>
  );
}
