import { useEffect, useState } from "react";
import { fetchLatestVersion, isNewer, reloadToVersion } from "../platform/updates";

const CHECK_EVERY_MS = 5 * 60 * 1000;

/** Shows "a newer version is available" with a one-click update. Your data is kept (it's in this browser and your files). */
export function UpdateBanner({ version }: { version: string }) {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      void fetchLatestVersion().then((v) => {
        if (!cancelled && v && isNewer(v, version)) setLatest(v);
      });
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [version]);

  if (!latest) return null;
  return (
    <div className="update-banner" role="status">
      <span>
        Nimble Bear {latest} is available (you have {version}).
      </span>
      <button type="button" className="primary" onClick={() => reloadToVersion(latest)}>
        Update now
      </button>
    </div>
  );
}
