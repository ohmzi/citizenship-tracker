import { ignoreTags, toTripInput, validateTripForm } from "./TripSheet";

describe("trip form", () => {
  const ok = { countries: ["CA"], leave: "2026-10-23", ret: "2026-10-30" };

  it("accepts a normal trip and an open one", () => {
    expect(validateTripForm(ok)).toBeNull();
    expect(validateTripForm({ ...ok, ret: "" })).toBeNull();
  });
  it("requires a country and a departure date", () => {
    expect(validateTripForm({ ...ok, countries: [] })).toBe("Choose a country.");
    expect(validateTripForm({ ...ok, leave: "" })).toBe("Enter the departure date.");
  });
  it("refuses US states and territories", () => {
    expect(validateTripForm({ ...ok, countries: ["PR"] })).toBe("Time in the US or a US territory isn't an absence.");
  });
  it("refuses a return before the departure", () => {
    expect(validateTripForm({ ...ok, ret: "2026-10-22" })).toBe("The return date can't be before the departure date.");
  });
  it("builds the TravStats trip, dropping auto so flights never overwrite an edit", () => {
    expect(toTripInput(ok, ["us-absence", "auto", "family"])).toEqual({
      name: "Canada",
      countries: ["CA"],
      startDate: "2026-10-23",
      endDate: "2026-10-30",
      tags: ["us-absence", "family"],
    });
    expect(toTripInput({ ...ok, ret: "" }, []).endDate).toBeNull();
    expect(toTripInput(ok, []).tags).toEqual(["us-absence"]);
  });
  it("ignores a flight-made trip instead of deleting it", () => {
    expect(ignoreTags(["us-absence", "auto"])).toEqual(["auto", "us-absence-ignored"]);
  });
});
