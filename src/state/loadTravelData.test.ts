import { applyOps } from "../sync/applyOps";
import { loadTravelData } from "./loadTravelData";
import { AuthError } from "../api/client";
import type { TravStatsApi, TripInput } from "../api/travstats";
import type { FlightRecord, TripRecord } from "../domain/types";

function fakeApi(flights: FlightRecord[], trips: TripRecord[]) {
  const log: string[] = [];
  const api: TravStatsApi = {
    login: async () => "ok",
    verifyTwoFactor: async () => {},
    logout: async () => {},
    me: async () => ({ username: "ohmz", firstName: "Omar" }),
    getSettings: async () => ({ greenCardDate: "2026-09-01", path: "spouse3" }),
    saveSettings: async () => {},
    listFlights: async () => flights,
    listTrips: async () => {
      log.push("listTrips");
      return trips.map((t) => ({ ...t }));
    },
    createTrip: async (input: TripInput) => {
      log.push(`create:${input.name}`);
      const created: TripRecord = {
        id: `new${trips.length}`,
        name: input.name,
        tags: input.tags,
        countries: input.countries,
        startDay: input.startDate,
        endDay: input.endDate,
      };
      trips.push(created);
      return created;
    },
    updateTrip: async (id, patch) => {
      log.push(`update:${id}:${(patch.tags ?? []).join("+")}`);
      const t = trips.find((x) => x.id === id) ?? { id, name: "", tags: [], countries: [], startDay: null, endDay: null };
      if (patch.tags) t.tags = patch.tags;
      return t;
    },
    deleteTrip: async () => {},
    assignFlights: async (tripId, ids) => {
      log.push(`attach:${tripId}:${ids.join(",")}`);
      for (const f of flights) if (ids.includes(f.id)) f.tripId = tripId;
    },
  };
  return { api, log };
}

const leg = (id: string, dep: string, arr: string, local: string): FlightRecord => ({
  id,
  status: "scheduled",
  depCountry: dep,
  arrCountry: arr,
  departure: { utc: `${local}:00Z`, local, precision: "minute" },
  arrival: { utc: `${local}:00Z`, local, precision: "minute" },
  tripId: null,
});

describe("loadTravelData", () => {
  it("creates the trip implied by flights, reloads, and summarizes", async () => {
    const flights = [leg("f1", "US", "CA", "2026-10-23T08:00"), leg("f2", "CA", "US", "2026-10-30T18:00")];
    const { api, log } = fakeApi(flights, []);
    const data = await loadTravelData(api, "2026-10-07");
    expect(log).toEqual(["listTrips", "create:Canada", "attach:new0:f1,f2", "listTrips"]);
    expect(data.classification.absences).toHaveLength(1);
    expect(data.summary?.plannedAbroadDays).toBe(6);
    expect(data.syncError).toBeNull();

    log.length = 0;
    await loadTravelData(api, "2026-10-07");
    expect(log).toEqual(["listTrips"]);
  });

  it("adopts the trip an interrupted sync created instead of creating a second one", async () => {
    const flights = [leg("f1", "US", "CA", "2026-10-23T08:00"), leg("f2", "CA", "US", "2026-10-30T18:00")];
    const { api, log } = fakeApi(flights, []);
    const assign = api.assignFlights;
    api.assignFlights = async () => {
      throw new Error("network");
    };
    expect((await loadTravelData(api, "2026-10-07")).syncError).toBe("network");

    api.assignFlights = assign;
    log.length = 0;
    await loadTravelData(api, "2026-10-07");
    expect(log).toEqual(["listTrips", "attach:new0:f1,f2", "listTrips"]);
  });

  it("tags untagged foreign trips it counts", async () => {
    const europe: TripRecord = {
      id: "e1",
      name: "Europe",
      tags: [],
      countries: ["FR"],
      startDay: "2027-05-01",
      endDay: "2027-05-10",
    };
    const { api, log } = fakeApi([], [europe]);
    const data = await loadTravelData(api, "2026-10-07");
    expect(log).toContain("update:e1:us-absence");
    expect(data.classification.absences.map((a) => a.id)).toEqual(["e1"]);
  });
});

describe("applyOps", () => {
  it("stops at the first failure and reports it", async () => {
    const { api } = fakeApi([], []);
    api.assignFlights = async () => {
      throw new Error("boom");
    };
    const result = await applyOps(api, [
      { kind: "tag", tripId: "x", tags: ["us-absence"] },
      { kind: "attach", tripId: "x", flightIds: ["f1"] },
      { kind: "tag", tripId: "y", tags: ["us-absence"] },
    ]);
    expect(result).toEqual({ applied: 1, error: "boom" });
  });

  it("rethrows an expired session", async () => {
    const { api } = fakeApi([], []);
    api.updateTrip = async () => {
      throw new AuthError();
    };
    await expect(applyOps(api, [{ kind: "tag", tripId: "x", tags: [] }])).rejects.toBeInstanceOf(AuthError);
  });
});
