import { ATTRIBUTION, FREE_APP_NOTICE, NIMBLE_STORE_URL, PRODUCT_NAME, UNOFFICIAL } from "./legalText";

export function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="screen welcome" aria-labelledby="welcome-title">
      <h1 id="welcome-title">Welcome to {PRODUCT_NAME}</h1>
      <p className="notice" role="note">
        {FREE_APP_NOTICE}
      </p>
      <p>
        <a href={NIMBLE_STORE_URL} target="_blank" rel="noreferrer">
          Visit nimbleRPG.com
        </a>
      </p>
      <p className="small">{UNOFFICIAL}</p>
      <p className="small">{ATTRIBUTION}</p>
      <button type="button" className="primary" onClick={onContinue} autoFocus>
        Continue
      </button>
    </section>
  );
}
