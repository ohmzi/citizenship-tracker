import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import { computeSummary } from "../domain/presence";
import type { Absence, Settings } from "../domain/types";
import type { TravelData } from "../state/loadTravelData";

const settings: Settings = { greenCardDate: "2026-09-01", path: "spouse3", displayName: "James" };
const canada: Absence = { id: "t1", name: "Canada", countries: ["CA"], leave: "2026-10-23", return: "2026-10-30", source: "manual" };

function renderHome(over: Partial<TravelData> = {}) {
  const data: TravelData = {
    user: { username: "ohmz", firstName: "Omar" },
    settings,
    trips: [],
    classification: { absences: [canada], review: [], toTag: [], overlaps: [] },
    notices: [],
    summary: computeSummary(settings, [canada], "2026-10-07"),
    syncError: null,
    today: "2026-10-07",
    ...over,
  };
  return render(
    <MemoryRouter>
      <HomePage data={data} hour={16} />
    </MemoryRouter>
  );
}

describe("HomePage", () => {
  it("shows the reference dashboard figures", () => {
    renderHome();
    expect(screen.getByText("Good afternoon, James")).toBeTruthy();
    expect(screen.getByText("1 month 7 days")).toBeTruthy();
    expect(screen.getByText("(since September 1, 2026)")).toBeTruthy();
    expect(screen.getByText("June 3, 2029")).toBeTruthy();
    expect(screen.getByText("2 years 7 months 27 days")).toBeTruthy();
    // Shown on the "In USA" tile and again inside the status card.
    expect(screen.getAllByText("1 mo 6 d").length).toBeGreaterThan(0);
    expect(screen.getByText("(18 months required)")).toBeTruthy();
    expect(screen.getByText("Your Canada trip is in 16 days")).toBeTruthy();
    expect(screen.getByText(/Oct 23 - Oct 30, 2026/)).toBeTruthy();
    expect(screen.getByText("37/37")).toBeTruthy();
    expect(screen.getByText(/Estimate, not legal advice/)).toBeTruthy();
  });

  it("asks for setup when there are no settings", () => {
    renderHome({ settings: null, summary: null });
    expect(screen.getByText("Set your green card date")).toBeTruthy();
  });

  it("explains an entry flight with no departure", () => {
    renderHome({ notices: [{ kind: "orphan_entry", flightId: "f9", day: "2026-11-02" }] });
    expect(screen.getByText(/You arrived in the US on Nov 2/)).toBeTruthy();
  });

  it("says a planned trip without a return isn't counted yet", () => {
    const planned: Absence = { ...canada, return: null };
    renderHome({
      classification: { absences: [planned], review: [], toTag: [], overlaps: [] },
      summary: computeSummary(settings, [planned], "2026-10-07"),
    });
    expect(
      screen.getByText(/has no return date, so its days abroad aren't counted yet\. Add the return flight or date\./)
    ).toBeTruthy();
    expect(screen.queryByText(/counts as abroad through today/)).toBeNull();
  });
});
