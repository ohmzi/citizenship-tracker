import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { AuthError } from "../api/client";
import type { TravStatsApi } from "../api/travstats";
import { LoginPage } from "./LoginPage";

function setup(login: TravStatsApi["login"]) {
  const api = { login: vi.fn(login), verifyTwoFactor: vi.fn(async () => {}) } as unknown as TravStatsApi;
  const onSignedIn = vi.fn(async () => {});
  render(<LoginPage api={api} onSignedIn={onSignedIn} />);
  return { api, onSignedIn };
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ohmz" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPage", () => {
  it("shows the tagline and the footer", () => {
    setup(async () => "ok");
    expect(screen.getByText("Your path to US citizenship, one day at a time.")).toBeTruthy();
    expect(screen.getByText("Uses your TravStats account · Estimate, not legal advice.")).toBeTruthy();
  });

  it("toggles password visibility", () => {
    setup(async () => "ok");
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();
  });

  it("moves to the code step and back", async () => {
    setup(async () => "two_factor");
    fillAndSubmit();
    expect(await screen.findByText("Enter the 6-digit code from your authenticator app.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Username")).toBeTruthy();
  });

  it("shows a friendly message when sign-in is rejected", async () => {
    const { onSignedIn } = setup(async () => {
      throw new AuthError();
    });
    fillAndSubmit();
    expect(await screen.findByText("That didn't work. Check your details and try again.")).toBeTruthy();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("disables the button while signing in", async () => {
    setup(() => new Promise(() => {}));
    fillAndSubmit();
    await waitFor(() => expect(screen.getByRole("button", { name: "Signing in…" })).toBeTruthy());
    expect((screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
