import { useState, type FormEvent } from "react";
import { AuthError } from "../api/client";
import type { TravStatsApi } from "../api/travstats";
import { Banner } from "../components/Banner";

export function LoginPage({ api, onSignedIn }: { api: TravStatsApi; onSignedIn: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "code">("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === "password") {
        const result = await api.login(username, password);
        if (result === "two_factor") {
          setStep("code");
          return;
        }
        if (result === "password_change") {
          setError("TravStats wants you to change your password first. Do that in TravStats, then sign in here.");
          return;
        }
      } else {
        await api.verifyTwoFactor(code);
      }
      await onSignedIn();
    } catch (err) {
      setError(err instanceof AuthError ? "That didn't work. Check your details and try again." : String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page login">
      <h1>Citizenship Tracker</h1>
      <p className="muted">Sign in with your TravStats account.</p>
      {error && <Banner tone="red">{error}</Banner>}
      <form className="card stack" onSubmit={submit}>
        {step === "password" ? (
          <>
            <label className="field">
              Username
              <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label className="field">
              Password
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        ) : (
          <label className="field">
            6-digit code from your authenticator
            <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Signing in…" : step === "password" ? "Sign in" : "Verify"}
        </button>
      </form>
    </main>
  );
}
