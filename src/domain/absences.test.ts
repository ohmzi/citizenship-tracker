import { classifyTrips, foreignCountries } from "./absences";
import { PICKER_COUNTRIES, countryName, flagEmoji } from "./countries";
import type { TripRecord } from "./types";

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
