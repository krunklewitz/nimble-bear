import { useState } from "react";
import { About } from "./About";
import { PRODUCT_NAME } from "./legalText";
import { usePlatform } from "./PlatformContext";
import { StorageCheck } from "./StorageCheck";
import { Welcome } from "./Welcome";

type Screen = "welcome" | "home" | "about" | "check";

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
  const { ready, role, platform } = usePlatform();
  const [screen, setScreen] = useState<Screen>(() => (welcomeSeen() ? "home" : "welcome"));

  if (!ready) {
    return <p className="screen" role="status">Loading…</p>;
  }

  return (
    <div className="app">
      <main>
        {screen === "welcome" && (
          <Welcome
            onContinue={() => {
              markWelcomeSeen();
              setScreen("home");
            }}
          />
        )}
        {screen === "home" && (
          <section className="screen" aria-labelledby="home-title">
            <h1 id="home-title">{PRODUCT_NAME}</h1>
            <p>
              {role === "GM" ? "GM view." : "Player view."} {platform.host === "owlbear" ? "Connected to Owlbear Rodeo." : "Running outside Owlbear (test mode)."}
            </p>
            <p className="small">The character sheet arrives in a later phase. For now you can run the storage check.</p>
            <button type="button" className="primary" onClick={() => setScreen("check")}>
              Run storage check
            </button>
          </section>
        )}
        {screen === "about" && <About version={version} onBack={() => setScreen("home")} />}
        {screen === "check" && <StorageCheck onBack={() => setScreen("home")} />}
      </main>
      {screen !== "welcome" && (
        <footer>
          <span>Free, unofficial fan tool.</span>{" "}
          <button type="button" className="link" onClick={() => setScreen("about")}>
            About &amp; license
          </button>
        </footer>
      )}
    </div>
  );
}
