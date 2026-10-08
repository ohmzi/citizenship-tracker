import { addDays, addYears, daysBetween, diffYMD, isDay, maxDay, minDay, todayIn, yearOf } from "./dates";

describe("dates", () => {
  it("validates calendar days", () => {
    expect(isDay("2026-09-01")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-9-1")).toBe(false);
    expect(isDay("")).toBe(false);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2029-09-01", -90)).toBe("2029-06-03");
  });

  it("counts days between two days", () => {
    expect(daysBetween("2026-09-01", "2026-10-07")).toBe(36);
    expect(daysBetween("2026-10-07", "2026-09-01")).toBe(-36);
  });

  it("adds years and moves Feb 29 to Mar 1 in a non-leap year", () => {
    expect(addYears("2026-09-01", 3)).toBe("2029-09-01");
    expect(addYears("2028-02-29", 3)).toBe("2031-03-01");
    expect(addYears("2028-02-29", -4)).toBe("2024-02-29");
  });

  it("diffs in calendar years, months and days", () => {
    expect(diffYMD("2026-10-07", "2029-06-03")).toEqual({ years: 2, months: 7, days: 27 });
    expect(diffYMD("2026-09-01", "2026-10-08")).toEqual({ years: 0, months: 1, days: 7 });
    expect(diffYMD("2027-01-31", "2027-03-01")).toEqual({ years: 0, months: 1, days: 1 });
    expect(diffYMD("2027-03-01", "2027-01-31")).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("reads today in an explicit zone", () => {
    const now = new Date("2026-10-08T02:30:00Z");
    expect(todayIn("America/New_York", now)).toBe("2026-10-07");
    expect(todayIn("Europe/Berlin", now)).toBe("2026-10-08");
  });

  it("orders and reads days", () => {
    expect(maxDay("2026-01-02", "2025-12-31")).toBe("2026-01-02");
    expect(minDay("2026-01-02", "2025-12-31")).toBe("2025-12-31");
    expect(yearOf("2026-10-07")).toBe(2026);
  });
});
