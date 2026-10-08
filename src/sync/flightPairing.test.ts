import { pairFlights } from "./flightPairing";
import type { FlightRecord } from "../domain/types";

let seq = 0;
function flight(
  dep: string,
  arr: string,
  depLocal: string,
  arrLocal: string,
  over: Partial<FlightRecord> = {}
): FlightRecord {
  seq += 1;
  return {
    id: `f${seq}`,
    status: "flown",
    depCountry: dep,
    arrCountry: arr,
    departure: { utc: `${depLocal}:00Z`, local: depLocal, precision: "minute" },
    arrival: { utc: `${arrLocal}:00Z`, local: arrLocal, precision: "minute" },
    tripId: null,
    ...over,
  };
}

describe("pairFlights", () => {
  it("pairs an out-and-back into one absence", () => {
    const out = flight("US", "CA", "2026-10-23T08:00", "2026-10-23T10:00");
    const back = flight("CA", "US", "2026-10-30T18:00", "2026-10-30T20:00");
    const { candidates, notices } = pairFlights([back, out]);
    expect(candidates).toEqual([
      {
        flightIds: [out.id, back.id],
        tripIds: [],
        looseFlightIds: [out.id, back.id],
        countries: ["CA"],
        leave: "2026-10-23",
        return: "2026-10-30",
        planned: false,
      },
    ]);
    expect(notices).toEqual([]);
  });

  it("collects every country of a multi-city trip", () => {
    const { candidates } = pairFlights([
      flight("US", "FR", "2027-05-01T18:00", "2027-05-02T08:00"),
      flight("FR", "IT", "2027-05-05T09:00", "2027-05-05T11:00"),
      flight("IT", "US", "2027-05-12T10:00", "2027-05-12T14:00"),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.countries).toEqual(["FR", "IT"]);
    expect(candidates[0]!.leave).toBe("2027-05-01");
    expect(candidates[0]!.return).toBe("2027-05-12");
  });

  it("leaves an exit without a return open", () => {
    const { candidates } = pairFlights([flight("US", "MX", "2026-10-01T08:00", "2026-10-01T11:00")]);
    expect(candidates[0]!.return).toBeNull();
  });

  it("reports an entry with no departure as an orphan", () => {
    const back = flight("CA", "US", "2026-11-02T18:00", "2026-11-02T20:00");
    const { candidates, notices } = pairFlights([back]);
    expect(candidates).toEqual([]);
    expect(notices).toEqual([{ kind: "orphan_entry", flightId: back.id, day: "2026-11-02" }]);
  });

  it("ignores domestic flights and trips to US territories", () => {
    const { candidates, notices } = pairFlights([
      flight("US", "US", "2026-10-01T08:00", "2026-10-01T11:00"),
      flight("US", "PR", "2026-12-20T08:00", "2026-12-20T12:00"),
      flight("PR", "US", "2026-12-27T13:00", "2026-12-27T17:00"),
    ]);
    expect(candidates).toEqual([]);
    expect(notices).toEqual([]);
  });

  it("closes an absence at the next exit when the return was not flown", () => {
    const toMexico = flight("US", "MX", "2026-10-01T08:00", "2026-10-01T11:00");
    const toCanada = flight("US", "CA", "2026-10-20T08:00", "2026-10-20T10:00");
    const back = flight("CA", "US", "2026-10-25T18:00", "2026-10-25T20:00");
    const { candidates, notices } = pairFlights([toMexico, toCanada, back]);
    expect(candidates.map((c) => [c.countries, c.leave, c.return])).toEqual([
      [["MX"], "2026-10-01", "2026-10-20"],
      [["CA"], "2026-10-20", "2026-10-25"],
    ]);
    expect(notices).toContainEqual({ kind: "return_assumed", flightId: toCanada.id, day: "2026-10-20" });
  });

  it("takes the local day, not the UTC day", () => {
    const late = flight("US", "MX", "2026-12-31T18:00", "2026-12-31T23:00");
    late.departure = { utc: "2027-01-01T02:00:00Z", local: "2026-12-31T18:00", precision: "minute" };
    expect(pairFlights([late]).candidates[0]!.leave).toBe("2026-12-31");
  });

  it("skips cancelled flights, flags uncertain dates and marks scheduled ones planned", () => {
    const cancelled = flight("US", "CA", "2026-10-02T08:00", "2026-10-02T10:00", { status: "cancelled" });
    const fuzzy = flight("US", "CA", "2026-11-01T12:00", "2026-11-01T14:00", { status: "scheduled" });
    fuzzy.departure = { ...fuzzy.departure!, precision: "unknown" };
    const { candidates, notices } = pairFlights([cancelled, fuzzy]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.planned).toBe(true);
    expect(notices).toEqual([{ kind: "date_uncertain", flightId: fuzzy.id }]);
  });

  it("separates flights that already belong to a trip", () => {
    const out = flight("US", "CA", "2026-10-23T08:00", "2026-10-23T10:00", { tripId: "t9" });
    const back = flight("CA", "US", "2026-10-30T18:00", "2026-10-30T20:00");
    const c = pairFlights([out, back]).candidates[0]!;
    expect(c.tripIds).toEqual(["t9"]);
    expect(c.looseFlightIds).toEqual([back.id]);
  });
});
