import { useEffect, useState } from "react";
import { isUnsaved, type ImportPlan } from "../app/library";
import { About } from "./About";
import { CharacterList } from "./CharacterList";
import { CharacterSheet } from "./CharacterSheet";
import { ImportReview } from "./ImportReview";
import { useLibrary } from "./LibraryContext";
import { usePlatform } from "./PlatformContext";
import { Snapshots } from "./Snapshots";
import { StorageCheck } from "./StorageCheck";
import { Welcome } from "./Welcome";

type Screen =
  | { name: "welcome" }
  | { name: "list" }
  | { name: "sheet"; id: string }
  | { name: "import"; plan: ImportPlan }
  | { name: "snapshots"; characterId?: string; back: Screen }
  | { name: "about" }
  | { name: "check" };

const WELCOME_KEY = "nimble-bear:welcome-seen";

function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return false;
  }
}

function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    // Storage blocked: the welcome screen simply shows again next time.
  }
}

export function App({ version }: { version: string }) {
  const { ready, platform } = usePlatform();
  const { library, memoryOnly } = useLibrary();
  const home = (): Screen => (library.activeId ? { name: "sheet", id: library.activeId } : { name: "list" });
  const [screen, setScreen] = useState<Screen>(() => (welcomeSeen() ? home() : { name: "welcome" }));

  // Badge on the Owlbear icon while the open character has unsaved changes.
  const active = library.activeId ? library.get(library.activeId) : undefined;
  const unsaved = active ? isUnsaved(active) : false;
  useEffect(() => {
    if (ready) void platform.setUnsavedBadge(unsaved);
  }, [ready, platform, unsaved]);

  if (!ready) return <p className="screen" role="status">Loading…</p>;

  const importText = async (text: string) => setScreen({ name: "import", plan: await library.prepareImport(text) });
  const openSheet = (id: string) => {
    void library.setActive(id);
    setScreen({ name: "sheet", id });
  };
  const toList = () => {
    void library.setActive(null);
    setScreen({ name: "list" });
  };

  return (
    <div className="app">
      {memoryOnly && (
        <p className="banner error" role="alert">
          This browser won't let Nimble Bear store data ({memoryOnly}). Changes last only until you close it. Save your character file often.
        </p>
      )}
      <main>
        {screen.name === "welcome" && (
          <Welcome
            onContinue={() => {
              markWelcomeSeen();
              setScreen(home());
            }}
          />
        )}
        {screen.name === "list" && (
          <CharacterList
            onOpen={openSheet}
            onImportText={(t) => void importText(t)}
            onRecover={() => setScreen({ name: "snapshots", back: { name: "list" } })}
          />
        )}
        {screen.name === "sheet" && (
          <CharacterSheet id={screen.id} onBack={toList} onSnapshots={(id) => setScreen({ name: "snapshots", characterId: id, back: screen })} />
        )}
        {screen.name === "import" && (
          <ImportReview plan={screen.plan} onDone={(id) => (id ? openSheet(id) : setScreen({ name: "list" }))} onCancel={() => setScreen({ name: "list" })} />
        )}
        {screen.name === "snapshots" && (
          <Snapshots
            {...(screen.characterId !== undefined ? { characterId: screen.characterId } : {})}
            onBack={() => setScreen(screen.back)}
            onRestored={openSheet}
          />
        )}
        {screen.name === "about" && <About version={version} onBack={() => setScreen(home())} onCheck={() => setScreen({ name: "check" })} />}
        {screen.name === "check" && <StorageCheck onBack={() => setScreen({ name: "about" })} />}
      </main>
      {screen.name !== "welcome" && (
        <footer>
          <span>Free, unofficial fan tool.</span>{" "}
          <button type="button" className="link" onClick={() => setScreen({ name: "about" })}>
            About &amp; license
          </button>
        </footer>
      )}
    </div>
  );
}
