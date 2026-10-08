import { formatDayCount, formatLongDay, formatRange, formatYMD, greetingFor } from "./format";

describe("format", () => {
  it("formats calendar spans like the reference app", () => {
    expect(formatYMD("2026-09-01", "2026-10-08")).toBe("1 month 7 days");
    expect(formatYMD("2026-10-07", "2029-06-03")).toBe("2 years 7 months 27 days");
    expect(formatYMD("2026-10-07", "2026-10-07")).toBe("0 days");
    expect(formatYMD("2026-10-07", "2027-10-07")).toBe("1 year");
  });
  it("formats day counts as months and days", () => {
    expect(formatDayCount(0)).toBe("0 days");
    expect(formatDayCount(1)).toBe("1 day");
    expect(formatDayCount(30)).toBe("30 days");
    expect(formatDayCount(37)).toBe("1 mo 6 d");
    expect(formatDayCount(548)).toBe("18 mo 0 d");
    expect(formatDayCount(-57)).toBe("-1 mo 26 d");
  });
  it("formats days and ranges", () => {
    expect(formatLongDay("2029-06-03")).toBe("June 3, 2029");
    expect(formatRange("2026-10-23", "2026-10-30")).toBe("Oct 23 - Oct 30, 2026");
    expect(formatRange("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026 - Jan 3, 2027");
    expect(formatRange("2026-10-01", null)).toBe("Oct 1, 2026 - return not logged");
  });
  it("greets by hour", () => {
    expect(greetingFor(9)).toBe("Good morning");
    expect(greetingFor(16)).toBe("Good afternoon");
    expect(greetingFor(21)).toBe("Good evening");
  });
});
