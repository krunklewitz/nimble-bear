import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CampaignBook } from "../../app/campaign";
import { localDateStamp, newId, sha256Hex } from "../../platform/files";
import { useLibrary } from "../LibraryContext";

const Ctx = createContext<CampaignBook | null>(null);

/** Opens the GM's campaign (only when the GM tools are shown). */
export function CampaignProvider({ version, children }: { version: string; children: ReactNode }) {
  const { library } = useLibrary();
  const [book, setBook] = useState<CampaignBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    CampaignBook.open({ store: library.store, hash: sha256Hex, now: () => new Date(), newId, appVersion: version, dateStamp: () => localDateStamp() })
      .then((b) => !cancelled && setBook(b))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [library, version]);

  if (error) return <p className="banner error" role="alert">Couldn't open the campaign: {error}</p>;
  if (!book) return <p role="status">Opening your campaign…</p>;
  return <Ctx.Provider value={book}>{children}</Ctx.Provider>;
}

/** The campaign book, re-rendering whenever it changes. */
export function useCampaign(): CampaignBook {
  const book = useContext(Ctx);
  if (!book) throw new Error("useCampaign must be used inside CampaignProvider");
  useSyncExternalStore(book.subscribe, book.getVersion);
  return book;
}
