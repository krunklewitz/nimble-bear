import { ATTRIBUTION, FREE_APP_NOTICE, NIMBLE_STORE_URL, SRD_NOTICE, UNOFFICIAL } from "./legalText";

export function About({ version, onBack, onCheck }: { version: string; onBack: () => void; onCheck: () => void }) {
  return (
    <section className="screen" aria-labelledby="about-title">
      <button type="button" className="link" onClick={onBack}>
        ← Back
      </button>
      <h1 id="about-title">About</h1>
      <p className="notice" role="note">
        {FREE_APP_NOTICE}
      </p>
      <p>
        <a href={NIMBLE_STORE_URL} target="_blank" rel="noreferrer">
          Buy Nimble at nimbleRPG.com
        </a>
      </p>
      <p>{ATTRIBUTION}</p>
      <p>{UNOFFICIAL}</p>
      <p className="small">{SRD_NOTICE}</p>
      <p className="small">Version {version}</p>
      <p>
        <button type="button" className="link" onClick={onCheck}>
          Storage check (diagnostics)
        </button>
      </p>
    </section>
  );
}
