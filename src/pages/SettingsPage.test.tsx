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
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveSettings).toHaveBeenCalledWith({ greenCardDate: "2026-09-01", path: "spouse3" });
  });

  it("shows no Save bar on first-time setup until a valid date is entered", () => {
    render(<SettingsPage data={data} api={{} as unknown as TravStatsApi} onSaved={async () => {}} />);
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Green card date"), { target: { value: "2026-09-01" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("refuses to save without a date", async () => {
    const saveSettings = vi.fn(async () => {});
    const { container } = render(<SettingsPage data={data} api={{ saveSettings } as unknown as TravStatsApi} onSaved={async () => {}} />);
    // There is no Save button while the form is empty, but Enter in a field still submits it.
    fireEvent.submit(container.querySelector("form")!);
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
      fireEvent.click(screen.getByRole("button", { name: "Edit green card date" }));
      fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
      fireEvent.change(screen.getByLabelText("Green card date"), { target: { value } });
    }

    it("shows the date locked, with an Edit button and no date input", () => {
      setup();
      expect(screen.getByText("🔒 September 1, 2026")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Edit green card date" })).toBeTruthy();
      expect(screen.queryByLabelText("Green card date")).toBeNull();
    });

    it("warns on Edit, and Cancel re-locks without saving", () => {
      const { saveSettings } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Edit green card date" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Edit green card date" }));
      fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
      expect((screen.getByLabelText("Green card date") as HTMLInputElement).value).toBe("2026-09-01");
    });

    it("asks to confirm a changed date before saving, then saves on Yes", async () => {
      const { saveSettings, onSaved } = setup();
      unlockAndChange("2026-08-15");
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      expect(
        screen.getByText(
          "Change your green card date from September 1, 2026 to August 15, 2026?",
        ),
      ).toBeTruthy();
      expect(screen.getByText("This recalculates your entire timeline. Be very careful.")).toBeTruthy();
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
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(saveSettings).not.toHaveBeenCalled();
      expect(screen.getByText("🔒 September 1, 2026")).toBeTruthy();
      expect(screen.queryByLabelText("Green card date")).toBeNull();
      expect(screen.queryByText(/Be very careful/)).toBeNull();
    });

    it("dismisses the confirmation when the date is edited, even to an empty value", () => {
      const { saveSettings } = setup();
      unlockAndChange("2026-08-15");
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      expect(screen.getByText(/Be very careful/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText("Green card date"), { target: { value: "" } });
      // The page must survive (a render crash would unmount it and make the checks below vacuous).
      expect((screen.getByLabelText("Green card date") as HTMLInputElement).value).toBe("");
      expect(screen.queryByText(/Be very careful/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Yes, change it" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
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

    function unlockPath() {
      fireEvent.click(screen.getByRole("button", { name: "Edit path" }));
      fireEvent.click(screen.getByRole("button", { name: "Unlock path" }));
    }

    it("(p1) shows the path locked with an Edit path button and no radios", () => {
      setup();
      expect(screen.getByText("🔒 3-year · spouse of a US citizen")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Edit path" })).toBeTruthy();
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
    });

    it("warns on Edit path with the same text, and Cancel path edit re-locks", () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "Edit path" }));
      expect(screen.getByText(/Your green card date drives every number in this app/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Cancel path edit" }));
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
      expect(screen.getByText("🔒 3-year · spouse of a US citizen")).toBeTruthy();
    });

    it("(p2) confirms a changed path before saving, then saves on Yes", async () => {
      const { saveSettings } = setup();
      unlockPath();
      expect(screen.getAllByRole("radio")).toHaveLength(2);
      fireEvent.click(screen.getByLabelText(/5-year/));
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      const banner = screen.getByRole("alert");
      expect(banner.textContent).toContain("Change your path from");
      expect(banner.textContent).toContain("3-year · spouse of a US citizen to 5-year · standard?");
      expect(saveSettings).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Yes, change it" }));
      await waitFor(() => expect(saveSettings).toHaveBeenCalled());
      expect(saveSettings).toHaveBeenCalledWith({ greenCardDate: "2026-09-01", path: "standard5" });
      expect(await screen.findByText("🔒 5-year · standard")).toBeTruthy();
    });

    it("(p3) lists a date change and a path change in one banner", () => {
      const { saveSettings } = setup();
      unlockAndChange("2026-08-15");
      unlockPath();
      fireEvent.click(screen.getByLabelText(/5-year/));
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      const alerts = screen.getAllByRole("alert");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.textContent).toContain("Change your green card date from September 1, 2026 to August 15, 2026?");
      expect(alerts[0]?.textContent).toContain("Change your path from");
      expect(alerts[0]?.textContent).toContain("Be very careful");
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it("Cancel on the confirmation restores both the date and the path", () => {
      setup();
      unlockAndChange("2026-08-15");
      unlockPath();
      fireEvent.click(screen.getByLabelText(/5-year/));
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByText("🔒 September 1, 2026")).toBeTruthy();
      expect(screen.getByText("🔒 3-year · spouse of a US citizen")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    });

    it("(s1) shows the earliest filing date for the current form values", () => {
      setup();
      expect(screen.getByText("Earliest filing date: June 3, 2029")).toBeTruthy();
      unlockPath();
      fireEvent.click(screen.getByLabelText(/5-year/));
      expect(screen.getByText("Earliest filing date: June 3, 2031")).toBeTruthy();
    });

    it("(s1) hides the earliest filing date when the date is empty", () => {
      setup();
      unlockAndChange("");
      expect(screen.queryByText(/Earliest filing date/)).toBeNull();
    });

    it("(s2) has no Save changes button until something changes", () => {
      setup();
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
      unlockPath();
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
      fireEvent.click(screen.getByLabelText(/5-year/));
      expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
      fireEvent.click(screen.getByLabelText(/3-year/));
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
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

    it("(n1) shows the name locked, with no name input", () => {
      setup();
      expect(screen.getByText("🔒 James")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Edit name" })).toBeTruthy();
      expect(screen.queryByLabelText(/Name shown on Home/)).toBeNull();
    });

    it("(n2) edits and saves the name with no confirmation, then locks it again", async () => {
      const { saveSettings } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
      expect((screen.getByLabelText(/Name shown on Home/) as HTMLInputElement).value).toBe("James");
      fireEvent.change(screen.getByLabelText(/Name shown on Home/), { target: { value: "Jim" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(saveSettings).toHaveBeenCalled());
      expect(saveSettings).toHaveBeenCalledWith({ greenCardDate: "2026-09-01", path: "spouse3", displayName: "Jim" });
      expect(screen.queryByText(/Be very careful/)).toBeNull();
      expect(await screen.findByText("🔒 Jim")).toBeTruthy();
      expect(screen.queryByLabelText(/Name shown on Home/)).toBeNull();
    });

    it("(n3) Cancel restores the saved name and re-locks", () => {
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
