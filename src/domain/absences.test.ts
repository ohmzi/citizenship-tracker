import { classifyTrips, foreignCountries, visibleForResidency, type Classification } from "./absences";
import { PICKER_COUNTRIES, countryName, flagEmoji } from "./countries";
import type { Absence, TripRecord } from "./types";

const t = (over: Partial<TripRecord>): TripRecord => ({
  id: "t",
  name: "Trip",
  tags: [],
  countries: ["CA"],
  startDay: "2026-10-23",
  endDay: "2026-10-30",
  ...over,
});

describe("countries", () => {
  it("names and flags codes", () => {
    expect(countryName("CA")).toBe("Canada");
    expect(flagEmoji("CA")).toBe("🇨🇦");
  });
  it("leaves US jurisdictions out of the picker", () => {
    const codes = PICKER_COUNTRIES.map((c) => c.code);
    for (const us of ["US", "PR", "GU", "VI", "MP"]) expect(codes).not.toContain(us);
    expect(codes).toContain("CA");
  });
  it("filters US jurisdictions from a country list", () => {
    expect(foreignCountries(["US", "CA", "PR", "FR"])).toEqual(["CA", "FR"]);
  });
});

describe("classifyTrips", () => {
  it("counts tagged trips and drops US from their countries", () => {
    const c = classifyTrips([t({ id: "a", tags: ["us-absence"], countries: ["US", "CA"] })]);
    expect(c.absences).toEqual([
      { id: "a", name: "Trip", countries: ["CA"], leave: "2026-10-23", return: "2026-10-30", source: "manual" },
    ]);
    expect(c.toTag).toEqual([]);
  });

  it("marks flight-created trips as auto", () => {
    const c = classifyTrips([t({ tags: ["us-absence", "auto"] })]);
    expect(c.absences[0]!.source).toBe("auto");
  });

  it("skips ignored trips entirely", () => {
    const c = classifyTrips([t({ tags: ["us-absence", "us-absence-ignored"] })]);
    expect(c.absences).toEqual([]);
    expect(c.review).toEqual([]);
  });

  it("counts and tags untagged trips that are entirely outside the US", () => {
    const trip = t({ id: "b", countries: ["FR", "IT"] });
    const c = classifyTrips([trip]);
    expect(c.absences[0]).toMatchObject({ id: "b", source: "travstats", countries: ["FR", "IT"] });
    expect(c.toTag).toEqual([trip]);
  });

  it("sends doubtful untagged trips to review", () => {
    const withUs = t({ id: "c", countries: ["US", "FR"] });
    const noCountry = t({ id: "d", countries: [] });
    const noDate = t({ id: "e", startDay: null });
    const puertoRico = t({ id: "f", countries: ["PR"] });
    const c = classifyTrips([withUs, noCountry, noDate, puertoRico]);
    expect(c.absences).toEqual([]);
    expect(c.review.map((r) => r.id)).toEqual(["c", "d", "e", "f"]);
  });

  it("sends a tagged trip without a start date to review", () => {
    const c = classifyTrips([t({ id: "g", tags: ["us-absence"], startDay: null })]);
    expect(c.review.map((r) => r.id)).toEqual(["g"]);
  });

  it("reports absences whose abroad days overlap, but not back-to-back ones", () => {
    const c = classifyTrips([
      t({ id: "a", tags: ["us-absence"], startDay: "2026-10-01", endDay: "2026-10-10" }),
      t({ id: "b", tags: ["us-absence"], startDay: "2026-10-05", endDay: "2026-10-15" }),
      t({ id: "c", tags: ["us-absence"], startDay: "2026-10-15", endDay: "2026-10-20" }),
    ]);
    expect(c.overlaps).toEqual([["a", "b"]]);
  });
});

describe("visibleForResidency", () => {
  const GC = "2026-09-01";
  const TODAY = "2026-10-07";
  const ab = (id: string, leave: string, ret: string | null): Absence => ({
    id,
    name: id,
    countries: ["CA"],
    leave,
    return: ret,
    source: "travstats",
  });
  const cls = (over: Partial<Classification>): Classification => ({ absences: [], review: [], toTag: [], overlaps: [], ...over });

  it("hides an absence that returned before the green card date", () => {
    const out = visibleForResidency(cls({ absences: [ab("old", "2026-08-10", "2026-08-20")] }), GC, TODAY);
    expect(out.absences).toEqual([]);
  });

  it("shows an absence returning on the green card date", () => {
    const out = visibleForResidency(cls({ absences: [ab("edge", "2026-08-25", "2026-09-01")] }), GC, TODAY);
    expect(out.absences.map((a) => a.id)).toEqual(["edge"]);
  });

  it("shows an open absence that left long ago", () => {
    const out = visibleForResidency(cls({ absences: [ab("open", "2025-03-01", null)] }), GC, TODAY);
    expect(out.absences.map((a) => a.id)).toEqual(["open"]);
  });

  it("shows a future trip", () => {
    const out = visibleForResidency(cls({ absences: [ab("soon", "2026-11-01", "2026-11-05")] }), GC, TODAY);
    expect(out.absences.map((a) => a.id)).toEqual(["soon"]);
  });

  it("hides a dateless review trip", () => {
    const out = visibleForResidency(cls({ review: [t({ id: "r", startDay: null, endDay: null })] }), GC, TODAY);
    expect(out.review).toEqual([]);
  });

  it("hides a review trip that ended before the green card date", () => {
    const out = visibleForResidency(cls({ review: [t({ id: "r", startDay: "2026-04-28", endDay: "2026-05-01" })] }), GC, TODAY);
    expect(out.review).toEqual([]);
  });

  it("uses the start day when a review trip has no end", () => {
    const out = visibleForResidency(
      cls({ review: [t({ id: "old", startDay: "2026-05-01", endDay: null }), t({ id: "new", startDay: "2026-09-15", endDay: null })] }),
      GC,
      TODAY
    );
    expect(out.review.map((r) => r.id)).toEqual(["new"]);
  });

  it("shows a future review trip", () => {
    const out = visibleForResidency(cls({ review: [t({ id: "r", startDay: "2026-11-01", endDay: "2026-11-05" })] }), GC, TODAY);
    expect(out.review.map((r) => r.id)).toEqual(["r"]);
  });

  it("drops an overlap pair that involves a hidden absence", () => {
    const old = ab("old", "2026-08-10", "2026-08-20");
    const a = ab("a", "2026-10-01", "2026-10-10");
    const b = ab("b", "2026-10-05", "2026-10-12");
    const out = visibleForResidency(
      cls({ absences: [old, a, b], overlaps: [["old", "a"], ["a", "b"]] }),
      GC,
      TODAY
    );
    expect(out.overlaps).toEqual([["a", "b"]]);
  });

  it("shows every dated item without a green card date, but still hides dateless review trips", () => {
    const out = visibleForResidency(
      cls({
        absences: [ab("old", "2020-01-01", "2020-01-10")],
        review: [t({ id: "dated", startDay: "2019-01-01", endDay: "2019-01-05" }), t({ id: "none", startDay: null, endDay: null })],
      }),
      null,
      TODAY
    );
    expect(out.absences.map((a) => a.id)).toEqual(["old"]);
    expect(out.review.map((r) => r.id)).toEqual(["dated"]);
  });
});
