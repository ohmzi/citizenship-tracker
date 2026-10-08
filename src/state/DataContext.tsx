import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AuthError } from "../api/client";
import { travstats, type TravStatsApi } from "../api/travstats";
import { todayIn } from "../domain/dates";
import { loadTravelData, type TravelData } from "./loadTravelData";

export type DataState =
  | { phase: "loading" }
  | { phase: "signed_out" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: TravelData };

interface DataContextValue {
  state: DataState;
  refresh: () => Promise<void>;
  api: TravStatsApi;
}

const DataContext = createContext<DataContextValue | null>(null);

// Module-level so the default keeps one identity: an inline arrow would change
// `refresh` on every render and re-run the load effect forever.
const systemNow = () => new Date();

export function DataProvider({
  children,
  api = travstats,
  now = systemNow,
}: {
  children: ReactNode;
  api?: TravStatsApi;
  now?: () => Date;
}) {
  const [state, setState] = useState<DataState>({ phase: "loading" });

  const load = useCallback(async () => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setState({ phase: "ready", data: await loadTravelData(api, todayIn(zone, now())) });
    } catch (e) {
      if (e instanceof AuthError) setState({ phase: "signed_out" });
      else setState({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [api, now]);

  // Single-flight: two overlapping loads would each create the same auto trip.
  // A refresh during a load waits for exactly one follow-up load, which starts
  // when the current one ends; refreshes before that follow-up starts share it.
  const inFlight = useRef<Promise<void> | null>(null);
  const followUp = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    const start = (): Promise<void> => {
      const run: Promise<void> = load().finally(() => {
        if (inFlight.current === run) inFlight.current = null;
      });
      inFlight.current = run;
      return run;
    };
    if (followUp.current) return followUp.current;
    if (inFlight.current) {
      const next = inFlight.current.then(() => {
        followUp.current = null;
        return start();
      });
      followUp.current = next;
      return next;
    }
    return start();
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <DataContext.Provider value={{ state, refresh, api }}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error("useData must be used inside <DataProvider>");
  return value;
}
