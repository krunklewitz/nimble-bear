import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { RollLog } from "../app/rolls";
import { usePlatform } from "./PlatformContext";

const Ctx = createContext<RollLog | null>(null);

/** Holds the session's roll log and adds rolls other players share. */
export function RollProvider({ children }: { children: ReactNode }) {
  const { platform } = usePlatform();
  const [log] = useState(() => new RollLog());
  useEffect(() => platform.onRoll((m) => log.add(m)), [platform, log]);
  return <Ctx.Provider value={log}>{children}</Ctx.Provider>;
}

export function useRollLog(): RollLog {
  const log = useContext(Ctx);
  if (!log) throw new Error("useRollLog must be used inside RollProvider");
  useSyncExternalStore(log.subscribe, log.getVersion);
  return log;
}
