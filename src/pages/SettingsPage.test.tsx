import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";
import { AuthError } from "../api/client";
import type { TravStatsApi } from "../api/travstats";
import type { TravelData } from "../state/loadTravelData";

const data = {
  user: { username: "ohmz", firstName: "Omar" },
  settings: null,
} as unknown as TravelData;

describe("SettingsPage", () => {
  it("saves green card date and path, then refreshes", async () => {
    const saveSettings = vi.fn(async () => {});
    const onSaved = vi.fn(async () => {});
    render(<SettingsPage data={data} api={{ saveSettings } as unknown as TravStatsApi} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Green card date"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByLabelText(/3-year/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveSettings).toHaveBeenCalledWith({ greenCardDate: "2026-09-01", path: "spouse3" });
  });

  it("refuses to save without a date", async () => {
    const saveSettings = vi.fn(async () => {});
    render(<SettingsPage data={data} api={{ saveSettings } as unknown as TravStatsApi} onSaved={async () => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter your green card date.")).toBeTruthy();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("treats an AuthError from logout as success and still calls onSaved", async () => {
    const logout = vi.fn(async () => {
      throw new AuthError();
    });
    const onSaved = vi.fn(async () => {});
    render(<SettingsPage data={data} api={{ logout } as unknown as TravStatsApi} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
