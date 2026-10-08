import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TripsPage } from "./TripsPage";
import type { Absence } from "../domain/types";
import type { TravelData } from "../state/loadTravelData";

const canada: Absence = { id: "t1", name: "Canada", countries: ["CA"], leave: "2026-10-23", return: "2026-10-30", source: "manual" };
const mexico: Absence = { id: "t2", name: "Mexico", countries: ["MX"], leave: "2026-10-28", return: "2026-11-02", source: "manual" };

function renderTrips(over: Partial<TravelData> = {}) {
  const data = {
    user: { username: "ohmz", firstName: "Omar" },
    settings: { greenCardDate: "2026-09-01", path: "spouse3" },
    trips: [],
    classification: { absences: [canada], review: [], toTag: [], overlaps: [] },
    notices: [],
    summary: null,
    syncError: null,
    today: "2026-10-07",
    ...over,
  } as unknown as TravelData;
  return render(
    <MemoryRouter>
      <TripsPage data={data} api={{} as never} onChanged={async () => {}} />
    </MemoryRouter>
  );
}

describe("TripsPage", () => {
  it("ends with the estimate footer", () => {
    renderTrips();
    expect(screen.getByText("Estimate, not legal advice.")).toBeTruthy();
  });

  it("explains overlapping absences", () => {
    renderTrips({
      classification: { absences: [canada, mexico], review: [], toTag: [], overlaps: [["t1", "t2"]] },
    } as Partial<TravelData>);
    expect(screen.getByText(/overlap — shared days are counted once/)).toBeTruthy();
  });

  it("asks for dates instead of offering Count on a review trip without a start", () => {
    renderTrips({
      classification: {
        absences: [],
        review: [{ id: "r1", name: "Trip to Spain", tags: [], countries: ["ES"], startDay: null, endDay: null }],
        toTag: [],
        overlaps: [],
      },
    } as Partial<TravelData>);
    expect(screen.getByText("Add dates to this trip in TravStats to count it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Count" })).toBeNull();
  });
});
