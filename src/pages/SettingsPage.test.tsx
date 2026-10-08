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

  describe("with a saved green card date", () => {
    const saved = {
      user: { username: "ohmz", firstName: "Omar" },
      settings: { greenCardDate: "2026-09-01", path: "spouse3" },
    } as unknown as TravelData;

    function setup() {
      const saveSettings = vi.fn(async (_input: { greenCardDate: string; path: string }) => {});
      const onSaved = vi.fn(async () => {});
      render(<SettingsPage data={saved} api={{ saveSettings } as unknown as TravStatsApi} onSaved={onSaved} />);
      return { saveSettings, onSaved };
    }

    function unlockAndChange(value: string) {
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
      fireEvent.change(screen.getByLabelText("Green card date"), { target: { value } });
    }

    it("shows the date locked, with an Edit button and no date input", () => {
      setup();
      expect(screen.getByText("🔒 September 1, 2026")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
      expect(screen.queryByLabelText("Green card date")).toBeNull();
    });

    it("warns on Edit, and Cancel re-locks without saving", () => {
      const { saveSettings } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      expect(
        screen.getByText(
          "Your green card date drives every number in this app: your apply date, days in the USA and which trips count. Only change it if it's wrong.",
        ),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByLabelText("Green card date")).toBeNull();
      expect(screen.getByText("🔒 September 1, 2026")).toBeTruthy();
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it("Unlock shows the date input prefilled with the saved date", () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
      expect((screen.getByLabelText("Green card date") as HTMLInputElement).value).toBe("2026-09-01");
    });

    it("asks to confirm a changed date before saving, then saves on Yes", async () => {
      const { saveSettings, onSaved } = setup();
      unlockAndChange("2026-08-15");
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(
        screen.getByText(
          "Change your green card date from September 1, 2026 to August 15, 2026? This recalculates your entire timeline. Be very careful.",
        ),
      ).toBeTruthy();
      expect(saveSettings).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Yes, change it" }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(saveSettings).toHaveBeenCalledWith({ greenCardDate: "2026-08-15", path: "spouse3" });
      expect(await screen.findByText("🔒 August 15, 2026")).toBeTruthy();
      expect(screen.queryByLabelText("Green card date")).toBeNull();
    });

    it("Cancel on the confirmation restores the saved date and does not save", () => {
      const { saveSettings } = setup();
      unlockAndChange("2026-08-15");
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(saveSettings).not.toHaveBeenCalled();
      expect(screen.getByText("🔒 September 1, 2026")).toBeTruthy();
      expect(screen.queryByLabelText("Green card date")).toBeNull();
      expect(screen.queryByText(/Be very careful/)).toBeNull();
    });

    it("dismisses the confirmation when the date is edited, even to an empty value", () => {
      const { saveSettings } = setup();
      unlockAndChange("2026-08-15");
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByText(/Be very careful/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText("Green card date"), { target: { value: "" } });
      // The page must survive (a render crash would unmount it and make the checks below vacuous).
      expect((screen.getByLabelText("Green card date") as HTMLInputElement).value).toBe("");
      expect(screen.queryByText(/Be very careful/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Yes, change it" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByText("Enter your green card date.")).toBeTruthy();
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it("Cancel while unlocked re-locks the saved date", () => {
      const { saveSettings } = setup();
      unlockAndChange("2026-08-15");
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByText("🔒 September 1, 2026")).toBeTruthy();
      expect(screen.queryByLabelText("Green card date")).toBeNull();
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it("saves straight away when only the path changes", async () => {
      const { saveSettings } = setup();
      fireEvent.click(screen.getByLabelText(/5-year/));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(saveSettings).toHaveBeenCalled());
      expect(saveSettings.mock.calls[0]?.[0]).toMatchObject({ greenCardDate: "2026-09-01" });
      expect(screen.queryByText(/Be very careful/)).toBeNull();
    });
  });

  describe("with a saved display name", () => {
    const saved = {
      user: { username: "ohmz", firstName: "Omar" },
      settings: { greenCardDate: "2026-09-01", path: "spouse3", displayName: "James" },
    } as unknown as TravelData;

    function setup() {
      const saveSettings = vi.fn(async (_input: { greenCardDate: string; path: string; displayName?: string }) => {});
      render(<SettingsPage data={saved} api={{ saveSettings } as unknown as TravStatsApi} onSaved={async () => {}} />);
      return { saveSettings };
    }

    it("shows the name locked, with no name input", () => {
      setup();
      expect(screen.getByText("🔒 James")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Edit name" })).toBeTruthy();
      expect(screen.queryByLabelText(/Name shown on Home/)).toBeNull();
    });

    it("edits and saves the name with no confirmation, then locks it again", async () => {
      const { saveSettings } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
      expect((screen.getByLabelText(/Name shown on Home/) as HTMLInputElement).value).toBe("James");
      fireEvent.change(screen.getByLabelText(/Name shown on Home/), { target: { value: "Jim" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(saveSettings).toHaveBeenCalled());
      expect(saveSettings).toHaveBeenCalledWith({ greenCardDate: "2026-09-01", path: "spouse3", displayName: "Jim" });
      expect(screen.queryByText(/Be very careful/)).toBeNull();
      expect(await screen.findByText("🔒 Jim")).toBeTruthy();
      expect(screen.queryByLabelText(/Name shown on Home/)).toBeNull();
    });

    it("Cancel restores the saved name and re-locks", () => {
      const { saveSettings } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
      fireEvent.change(screen.getByLabelText(/Name shown on Home/), { target: { value: "Jim" } });
      fireEvent.click(screen.getByRole("button", { name: "Cancel name edit" }));
      expect(screen.getByText("🔒 James")).toBeTruthy();
      expect(screen.queryByLabelText(/Name shown on Home/)).toBeNull();
      expect(saveSettings).not.toHaveBeenCalled();
    });
  });

  it("hints which date to use when none is saved", () => {
    render(<SettingsPage data={data} api={{} as unknown as TravStatsApi} onSaved={async () => {}} />);
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "Use the Resident since date on your green card."),
    ).toBeTruthy();
  });
});
