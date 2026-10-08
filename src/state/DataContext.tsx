import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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

  const refresh = useCallback(async () => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setState({ phase: "ready", data: await loadTravelData(api, todayIn(zone, now())) });
    } catch (e) {
      if (e instanceof AuthError) setState({ phase: "signed_out" });
      else setState({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [api, now]);

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
