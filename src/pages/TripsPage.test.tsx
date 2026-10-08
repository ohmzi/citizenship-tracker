import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TripsPage } from "./TripsPage";
import type { TravStatsApi } from "../api/travstats";
import type { Absence, TripRecord } from "../domain/types";
import type { TravelData } from "../state/loadTravelData";

const canada: Absence = { id: "t1", name: "Canada", countries: ["CA"], leave: "2026-10-23", return: "2026-10-30", source: "manual" };
const mexico: Absence = { id: "t2", name: "Mexico", countries: ["MX"], leave: "2026-10-28", return: "2026-11-02", source: "manual" };

function renderTrips(over: Partial<TravelData> = {}, api: TravStatsApi = {} as never) {
  const data = {
    user: { username: "ohmz", firstName: "Omar" },
    settings: { greenCardDate: "2026-09-01", path: "spouse3" },
    trips: [],
    classification: { absences: [canada], review: [], toTag: [], overlaps: [] },
    notices: [],
    summary: null,
    syncError: null,
    today: "2026-10-07",
    ...over,
  } as unknown as TravelData;
  return render(
    <MemoryRouter>
      <TripsPage data={data} api={api} onChanged={async () => {}} />
    </MemoryRouter>
  );
}

describe("TripsPage", () => {
  it("ends with the estimate footer", () => {
    renderTrips();
    expect(screen.getByText("Estimate, not legal advice.")).toBeTruthy();
  });

  it("explains overlapping absences", () => {
    renderTrips({
      classification: { absences: [canada, mexico], review: [], toTag: [], overlaps: [["t1", "t2"]] },
    } as Partial<TravelData>);
    expect(screen.getByText(/overlap — shared days are counted once/)).toBeTruthy();
  });

  it("does not show a review trip without dates", () => {
    renderTrips({
      classification: {
        absences: [],
        review: [{ id: "r1", name: "Trip to Spain", tags: [], countries: ["ES"], startDay: null, endDay: null }],
        toTag: [],
        overlaps: [],
      },
    } as Partial<TravelData>);
    expect(screen.queryByText("Trip to Spain")).toBeNull();
    expect(screen.queryByText("Needs review")).toBeNull();
    expect(screen.queryByText(/Add dates to this trip/)).toBeNull();
  });

  it("does not show a TravStats trip that ended before the green card date", () => {
    const old: Absence = { id: "o1", name: "Old", countries: ["FR"], leave: "2026-05-01", return: "2026-05-10", source: "travstats" };
    renderTrips({
      classification: {
        absences: [canada, old],
        review: [{ id: "r2", name: "Sumayya's wedding", tags: [], countries: ["CA", "TR"], startDay: "2026-03-01", endDay: "2026-03-09" }],
        toTag: [],
        overlaps: [],
      },
    } as Partial<TravelData>);
    expect(screen.getByRole("button", { name: /Canada/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /France/ })).toBeNull();
    expect(screen.queryByText("Sumayya's wedding")).toBeNull();
    expect(screen.queryByText("Needs review")).toBeNull();
  });

  describe("removing a trip", () => {
    const record = (tags: string[]): TripRecord => ({
      id: "t1",
      name: "Canada",
      tags,
      countries: ["CA"],
      startDay: "2026-10-23",
      endDay: "2026-10-30",
    });
    function setup(tags: string[]) {
      const calls: string[] = [];
      const api = {
        updateTrip: async (id: string, patch: { tags?: string[] }) => {
          calls.push(`update:${id}:${(patch.tags ?? []).join("+")}`);
          return record(patch.tags ?? tags);
        },
        deleteTrip: async (id: string) => {
          calls.push(`delete:${id}`);
        },
      } as unknown as TravStatsApi;
      renderTrips({ trips: [record(tags)] }, api);
      fireEvent.click(screen.getByRole("button", { name: /Canada/ }));
      return calls;
    }
    afterEach(() => vi.restoreAllMocks());

    it("offers only Don't count for a trip this app didn't create", async () => {
      const calls = setup(["us-absence", "family"]);
      expect(screen.queryByRole("button", { name: "Delete trip" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Don't count this trip" }));
      await waitFor(() => expect(calls).toEqual(["update:t1:family+us-absence-ignored"]));
    });

    it("offers only Don't count for a flight-made trip, even one tagged as this app's", () => {
      setup(["us-absence", "auto", "citizenship-app"]);
      expect(screen.queryByRole("button", { name: "Delete trip" })).toBeNull();
      expect(screen.getByRole("button", { name: "Don't count this trip" })).toBeTruthy();
    });

    it("deletes a trip this app created only after the user confirms", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const calls = setup(["us-absence", "citizenship-app"]);
      fireEvent.click(screen.getByRole("button", { name: "Delete trip" }));
      expect(confirm).toHaveBeenCalledWith("Delete this trip from TravStats? This can't be undone.");
      const button = screen.getByRole<HTMLButtonElement>("button", { name: "Delete trip" });
      await waitFor(() => expect(button.disabled).toBe(false));
      expect(calls).toEqual([]);

      confirm.mockReturnValue(true);
      fireEvent.click(button);
      await waitFor(() => expect(calls).toEqual(["delete:t1"]));
    });

    it("never marks an edited TravStats trip as this app's, even with no tags loaded", async () => {
      const calls = setup([]);
      fireEvent.click(screen.getByRole("button", { name: "Save Trip" }));
      await waitFor(() => expect(calls).toEqual(["update:t1:us-absence"]));
    });
  });
});
