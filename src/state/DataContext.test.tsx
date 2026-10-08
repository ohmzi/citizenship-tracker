import { act, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type { TravStatsApi } from "../api/travstats";
import type { TripRecord } from "../domain/types";
import { DataProvider, useData } from "./DataContext";

const fixedNow = () => new Date("2026-10-07T12:00:00Z");

/** An api whose listTrips waits until the test releases it, and which tracks overlapping loads. */
function slowApi() {
  const gates: Array<() => void> = [];
  const stats = { meCalls: 0, active: 0, maxActive: 0 };
  const api = {
    me: async () => {
      stats.meCalls += 1;
      stats.active += 1;
      stats.maxActive = Math.max(stats.maxActive, stats.active);
      return { username: "ohmz", firstName: "Omar" };
    },
    getSettings: async () => null,
    listFlights: async () => [],
    // With no flights and no trips a load reads listTrips exactly once, so its
    // resolution is the end of that load's TravStats work.
    listTrips: () =>
      new Promise<TripRecord[]>((resolve) => {
        gates.push(() => {
          stats.active -= 1;
          resolve([]);
        });
      }),
  } as unknown as TravStatsApi;
  return { api, gates, stats };
}

describe("DataProvider", () => {
  it("never runs two loads at once and coalesces refreshes into one follow-up", async () => {
    const { api, gates, stats } = slowApi();
    let refresh: () => Promise<void> = async () => {};
    function Grab() {
      refresh = useData().refresh;
      return null;
    }
    render(
      <StrictMode>
        <DataProvider api={api} now={fixedNow}>
          <Grab />
        </DataProvider>
      </StrictMode>
    );

    await waitFor(() => expect(gates).toHaveLength(1));
    let second!: Promise<void>;
    let third!: Promise<void>;
    act(() => {
      second = refresh();
      third = refresh();
    });

    await act(async () => gates[0]!());
    await waitFor(() => expect(gates).toHaveLength(2));
    await act(async () => {
      gates[1]!();
      await Promise.all([second, third]);
    });

    expect(stats.meCalls).toBeLessThanOrEqual(2);
    expect(stats.maxActive).toBe(1);
    expect(gates).toHaveLength(2);
  });
});
