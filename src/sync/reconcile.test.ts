import { reconcile, tripName } from "./reconcile";
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
const fields = { name: "Canada", countries: ["CA"], startDate: "2026-10-23", endDate: "2026-10-30" };

describe("reconcile", () => {
  it("names trips from their countries", () => {
    expect(tripName(["CA", "FR"])).toBe("Canada, France");
    expect(tripName([])).toBe("Abroad");
  });

  it("creates a tagged trip for flights that have none", () => {
    expect(reconcile([candidate()], [])).toEqual([
      { kind: "create", fields, tags: ["us-absence", "auto"], flightIds: ["f1", "f2"] },
    ]);
  });

  it("tags the trip the flights already belong to and attaches the rest", () => {
    const owner = trip({ id: "t9", name: "Toronto weekend", tags: ["family"] });
    const ops = reconcile([candidate({ tripIds: ["t9"], looseFlightIds: ["f2"] })], [owner]);
    expect(ops).toEqual([
      { kind: "tag", tripId: "t9", tags: ["family", "us-absence"] },
      { kind: "attach", tripId: "t9", flightIds: ["f2"] },
    ]);
  });

  it("leaves flights of an ignored trip alone", () => {
    const ignored = trip({ id: "t9", tags: ["us-absence-ignored"] });
    expect(reconcile([candidate({ tripIds: ["t9"], looseFlightIds: [] })], [ignored])).toEqual([]);
  });

  it("never moves flights whose trip it cannot see", () => {
    expect(reconcile([candidate({ tripIds: ["unknown"], looseFlightIds: ["f2"] })], [])).toEqual([]);
  });

  it("attaches flights to an overlapping manual absence without rewriting it", () => {
    const manual = trip({ id: "m1", tags: ["us-absence"], startDay: "2026-10-22", endDay: "2026-10-31" });
    expect(reconcile([candidate()], [manual])).toEqual([
      { kind: "attach", tripId: "m1", flightIds: ["f1", "f2"] },
    ]);
  });

  it("rewrites an auto trip whose flights changed", () => {
    const auto = trip({ id: "a1", tags: ["us-absence", "auto"], endDay: "2026-10-29" });
    const ops = reconcile([candidate({ tripIds: ["a1"], looseFlightIds: [] })], [auto]);
    expect(ops).toEqual([{ kind: "update", tripId: "a1", fields }]);
  });

  it("is idempotent once its ops are applied", () => {
    const applied = trip({ id: "new", tags: ["us-absence", "auto"], countries: ["US", "CA"] });
    expect(reconcile([candidate({ tripIds: ["new"], looseFlightIds: [] })], [applied])).toEqual([]);
  });
});
