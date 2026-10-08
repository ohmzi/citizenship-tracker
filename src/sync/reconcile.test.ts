import { dateMismatches, reconcile, tripName } from "./reconcile";
import type { Candidate } from "./flightPairing";
import type { TripRecord } from "../domain/types";

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  flightIds: ["f1", "f2"],
  tripIds: [],
  looseFlightIds: ["f1", "f2"],
  countries: ["CA"],
  leave: "2026-10-23",
  return: "2026-10-30",
  planned: false,
  ...over,
});
const trip = (over: Partial<TripRecord>): TripRecord => ({
  id: "t1",
  name: "Canada",
  tags: [],
  countries: ["CA"],
  startDay: "2026-10-23",
  endDay: "2026-10-30",
  ...over,
});
/** Every tripId any flight carries, as loadTravelData builds it. */
const refs = (cs: Candidate[], extra: string[] = []) => new Set([...cs.flatMap((c) => c.tripIds), ...extra]);
const run = (cs: Candidate[], trips: TripRecord[], extra: string[] = []) => reconcile(cs, trips, refs(cs, extra));
const fields = { name: "Canada", countries: ["CA"], startDate: "2026-10-23", endDate: "2026-10-30" };

describe("reconcile", () => {
  it("names trips from their countries", () => {
    expect(tripName(["CA", "FR"])).toBe("Canada, France");
    expect(tripName([])).toBe("Abroad");
  });

  it("creates a tagged trip for flights that have none", () => {
    expect(run([candidate()], [])).toEqual([
      { kind: "create", fields, tags: ["us-absence", "auto"], flightIds: ["f1", "f2"] },
    ]);
  });

  it("tags the trip the flights already belong to and attaches the rest", () => {
    const owner = trip({ id: "t9", name: "Toronto weekend", tags: ["family"] });
    const ops = run([candidate({ tripIds: ["t9"], looseFlightIds: ["f2"] })], [owner]);
    expect(ops).toEqual([
      { kind: "tag", tripId: "t9", tags: ["family", "us-absence"] },
      { kind: "attach", tripId: "t9", flightIds: ["f2"] },
    ]);
  });

  it("leaves flights of an ignored trip alone", () => {
    const ignored = trip({ id: "t9", tags: ["us-absence-ignored"] });
    expect(run([candidate({ tripIds: ["t9"], looseFlightIds: [] })], [ignored])).toEqual([]);
  });

  it("never moves flights whose trip it cannot see", () => {
    expect(run([candidate({ tripIds: ["unknown"], looseFlightIds: ["f2"] })], [])).toEqual([]);
  });

  it("attaches flights to an overlapping manual absence without rewriting it", () => {
    const manual = trip({ id: "m1", tags: ["us-absence"], startDay: "2026-10-22", endDay: "2026-10-31" });
    expect(run([candidate()], [manual])).toEqual([
      { kind: "attach", tripId: "m1", flightIds: ["f1", "f2"] },
    ]);
  });

  it("rewrites an auto trip whose flights changed", () => {
    const auto = trip({ id: "a1", tags: ["us-absence", "auto"], endDay: "2026-10-29" });
    const ops = run([candidate({ tripIds: ["a1"], looseFlightIds: [] })], [auto]);
    expect(ops).toEqual([{ kind: "update", tripId: "a1", fields }]);
  });

  it("is idempotent once its ops are applied", () => {
    const applied = trip({ id: "new", tags: ["us-absence", "auto"], countries: ["US", "CA"] });
    expect(run([candidate({ tripIds: ["new"], looseFlightIds: [] })], [applied])).toEqual([]);
  });

  it("never lets a boundary-sharing candidate claim or rewrite another's auto trip", () => {
    const a = trip({
      id: "A",
      tags: ["us-absence", "auto"],
      countries: ["MX"],
      startDay: "2026-10-01",
      endDay: "2026-10-10",
    });
    const c1 = candidate({
      tripIds: ["A"],
      looseFlightIds: [],
      countries: ["MX"],
      leave: "2026-10-01",
      return: "2026-10-10",
    });
    const c2 = candidate({
      flightIds: ["f3", "f4"],
      tripIds: [],
      looseFlightIds: ["f3", "f4"],
      countries: ["CA"],
      leave: "2026-10-10",
      return: "2026-10-20",
    });
    expect(run([c1, c2], [a])).toEqual([
      {
        kind: "create",
        fields: { name: "Canada", countries: ["CA"], startDate: "2026-10-10", endDate: "2026-10-20" },
        tags: ["us-absence", "auto"],
        flightIds: ["f3", "f4"],
      },
    ]);
  });

  it("emits no update when two candidates own the same auto trip with different fields", () => {
    const a = trip({
      id: "A",
      tags: ["us-absence", "auto"],
      countries: ["MX"],
      startDay: "2026-10-01",
      endDay: "2026-10-10",
    });
    const c1 = candidate({
      tripIds: ["A"],
      looseFlightIds: [],
      countries: ["MX"],
      leave: "2026-10-01",
      return: "2026-10-12",
    });
    const c2 = candidate({
      tripIds: ["A"],
      looseFlightIds: [],
      countries: ["MX"],
      leave: "2026-10-01",
      return: "2026-10-15",
    });
    expect(run([c1, c2], [a])).toEqual([]);
  });

  it("attaches loose flights to a candidate's manual trip rather than its auto trip", () => {
    const a = trip({ id: "A", tags: ["us-absence", "auto"], startDay: "2026-10-23", endDay: "2026-10-30" });
    const m = trip({ id: "M", tags: ["us-absence"], startDay: "2026-10-23", endDay: "2026-10-30" });
    const ops = run([candidate({ tripIds: ["A", "M"], looseFlightIds: ["f9"] })], [a, m]);
    expect(ops).toEqual([{ kind: "attach", tripId: "M", flightIds: ["f9"] }]);
  });

  it("adopts an orphan auto trip with matching dates instead of creating another", () => {
    const orphan = trip({ id: "A", tags: ["us-absence", "auto"] });
    expect(run([candidate()], [orphan])).toEqual([{ kind: "attach", tripId: "A", flightIds: ["f1", "f2"] }]);
  });

  it("adopts an orphan auto trip with other dates and rewrites it", () => {
    const orphan = trip({ id: "A", tags: ["us-absence", "auto"], startDay: "2026-10-24", endDay: "2026-10-29" });
    expect(run([candidate()], [orphan])).toEqual([
      { kind: "attach", tripId: "A", flightIds: ["f1", "f2"] },
      { kind: "update", tripId: "A", fields },
    ]);
  });

  it("prefers an overlapping manual trip over an orphan auto trip", () => {
    const orphan = trip({ id: "A", tags: ["us-absence", "auto"] });
    const manual = trip({ id: "M", tags: ["us-absence"] });
    expect(run([candidate()], [orphan, manual])).toEqual([{ kind: "attach", tripId: "M", flightIds: ["f1", "f2"] }]);
  });

  it("never adopts an auto trip that some flight points to", () => {
    const owned = trip({ id: "A", tags: ["us-absence", "auto"] });
    expect(run([candidate()], [owned], ["A"])).toEqual([
      { kind: "create", fields, tags: ["us-absence", "auto"], flightIds: ["f1", "f2"] },
    ]);
  });

  it("never rewrites an orphan auto trip two candidates adopt", () => {
    const orphan = trip({ id: "A", tags: ["us-absence", "auto"], startDay: "2026-10-01", endDay: "2026-10-31" });
    const c2 = candidate({ flightIds: ["f3"], looseFlightIds: ["f3"], leave: "2026-10-25", return: "2026-10-28" });
    expect(run([candidate(), c2], [orphan])).toEqual([
      { kind: "attach", tripId: "A", flightIds: ["f1", "f2"] },
      { kind: "attach", tripId: "A", flightIds: ["f3"] },
    ]);
  });
});

describe("dateMismatches", () => {
  const manual = trip({ id: "m1", name: "Toronto", tags: ["us-absence"] });

  it("reports flights that run outside the manual trip they belong with", () => {
    const c = candidate({ leave: "2026-10-21", return: "2026-11-02" });
    expect(dateMismatches([c], [manual], refs([c]))).toEqual([
      {
        tripId: "m1",
        tripName: "Toronto",
        tripStart: "2026-10-23",
        tripEnd: "2026-10-30",
        flightLeave: "2026-10-21",
        flightReturn: "2026-11-02",
      },
    ]);
  });

  it("reports nothing when the dates agree", () => {
    expect(dateMismatches([candidate()], [manual], refs([candidate()]))).toEqual([]);
  });

  it("reports nothing for a flight-made trip, which sync rewrites itself", () => {
    const c = candidate({ tripIds: ["a1"], looseFlightIds: [], leave: "2026-10-21" });
    expect(dateMismatches([c], [trip({ id: "a1", tags: ["us-absence", "auto"] })], refs([c]))).toEqual([]);
  });
});
