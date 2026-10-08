import { abroadDays, abroadDaysSince, computeSummary } from "./presence";
import type { Absence, Settings } from "./types";

const spouse: Settings = { greenCardDate: "2026-09-01", path: "spouse3" };
const trip = (id: string, leave: string, ret: string | null): Absence => ({
  id,
  name: "Canada",
  countries: ["CA"],
  leave,
  return: ret,
  source: "manual",
});

describe("abroadDays", () => {
  it("counts the departure and return days as present", () => {
    expect(abroadDays(trip("a", "2026-10-23", "2026-10-30"), "2026-10-07")).toBe(6);
    expect(abroadDays(trip("a", "2026-10-10", "2026-10-10"), "2026-10-07")).toBe(0);
    expect(abroadDays(trip("a", "2026-10-10", "2026-10-11"), "2026-10-07")).toBe(0);
    expect(abroadDays(trip("a", "2026-10-10", "2026-10-12"), "2026-10-07")).toBe(1);
  });
  it("counts an open absence through today", () => {
    expect(abroadDays(trip("a", "2026-10-01", null), "2026-10-07")).toBe(6);
  });
});

describe("computeSummary", () => {
  it("reproduces the reference screenshots", () => {
    const s = computeSummary(spouse, [trip("t1", "2026-10-23", "2026-10-30")], "2026-10-07");
    expect(s.earliestFilingDate).toBe("2029-06-03");
    expect(s.projectedApplyDate).toBe("2029-06-03");
    expect(s.requiredDays).toBe(548);
    expect(s.requiredMonths).toBe(18);
    expect(s.daysAsPermanentResident).toBe(37);
    expect(s.daysInUsSoFar).toBe(37);
    expect(s.daysAbroadSoFar).toBe(0);
    expect(s.plannedAbroadDays).toBe(6);
    expect(s.roomLeftDays).toBe(453);
    expect(s.countdownDays).toBe(970);
    expect(s.yearBars).toEqual([{ year: 2026, present: 37, elapsed: 37 }]);
    expect(s.tripsThatCount).toHaveLength(1);
    expect(s.tripsThatCount[0]).toMatchObject({ calendarDays: 8, abroadDays: 6 });
    expect(s.nextTrip).toMatchObject({ daysUntil: 16, abroadDays: 6 });
    expect(s.warnings).toEqual([]);
    expect(s.status).toBe("on_track");
  });

  it("counts overlapping absences once", () => {
    const s = computeSummary(
      spouse,
      [trip("a", "2026-10-01", "2026-10-10"), trip("b", "2026-10-05", "2026-10-15")],
      "2026-10-31"
    );
    expect(s.daysAbroadSoFar).toBe(13);
    expect(s.daysInUsSoFar).toBe(61 - 13);
  });

  it("ignores abroad days before the green card date", () => {
    const s = computeSummary(spouse, [trip("a", "2026-08-20", "2026-09-10")], "2026-09-30");
    expect(s.daysAsPermanentResident).toBe(30);
    expect(s.daysAbroadSoFar).toBe(9);
    expect(s.daysInUsSoFar).toBe(21);
  });

  it("warns when a return is not logged", () => {
    const s = computeSummary(spouse, [trip("a", "2026-10-01", null)], "2026-10-07");
    expect(s.daysInUsSoFar).toBe(31);
    expect(s.warnings).toContainEqual({ kind: "return_not_logged", absenceId: "a" });
  });

  it("flags a presumed break over 180 days abroad", () => {
    const s = computeSummary(spouse, [trip("a", "2027-01-01", "2027-07-15")], "2026-10-07");
    expect(s.warnings).toContainEqual({ kind: "presumed_break", absenceId: "a", abroadDays: 194 });
    expect(s.status).toBe("at_risk");
  });

  it("flags a broken residence at 365 days abroad", () => {
    const s = computeSummary(spouse, [trip("a", "2027-01-01", "2028-01-05")], "2026-10-07");
    expect(s.warnings).toContainEqual({ kind: "breaks_residence", absenceId: "a", abroadDays: 368 });
  });

  it("pushes the apply date when planned travel leaves too little presence", () => {
    const s = computeSummary(spouse, [trip("a", "2027-01-01", "2028-06-01")], "2026-10-07");
    expect(s.projectedApplyDate).toBe("2029-07-30");
    expect(s.roomLeftDays).toBe(-57);
    expect(s.status).toBe("behind");
  });

  it("supports the 5-year path", () => {
    const s = computeSummary({ greenCardDate: "2026-09-01", path: "standard5" }, [], "2026-10-07");
    expect(s.earliestFilingDate).toBe("2031-06-03");
    expect(s.requiredDays).toBe(913);
  });

  it("handles a Feb 29 green card date", () => {
    const s = computeSummary({ greenCardDate: "2028-02-29", path: "spouse3" }, [], "2028-03-01");
    expect(s.earliestFilingDate).toBe("2030-12-01");
  });

  it("returns zeros, not errors, before the green card date", () => {
    const s = computeSummary({ greenCardDate: "2026-12-01", path: "spouse3" }, [], "2026-10-07");
    expect(s.daysAsPermanentResident).toBe(0);
    expect(s.daysInUsSoFar).toBe(0);
    expect(s.daysAbroadSoFar).toBe(0);
    expect(s.yearBars).toEqual([]);
    expect(s.earliestFilingDate).toBe("2029-09-02");
    expect(s.countdownDays).toBe(1061);
  });

  it("raises no residence warning for an absence that ended before the green card date", () => {
    const s = computeSummary(spouse, [trip("a", "2023-05-01", "2026-08-25")], "2026-10-07");
    expect(s.warnings).toEqual([]);
    expect(s.status).toBe("on_track");
  });

  it("measures residence warnings only from the green card date", () => {
    const a = trip("a", "2026-03-01", "2026-12-01");
    // 2026-09-01 through 2026-11-30.
    expect(abroadDaysSince(a, "2026-09-01", "2026-10-07")).toBe(91);
    const s = computeSummary(spouse, [a], "2026-10-07");
    expect(s.warnings).toEqual([]);
    // The trip list still shows the whole trip.
    expect(s.tripsThatCount[0]!.abroadDays).toBe(274);
  });
});
