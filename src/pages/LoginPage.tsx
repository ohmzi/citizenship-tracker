import { useId, useState, type FormEvent, type ReactNode } from "react";
import { AuthError } from "../api/client";
import type { TravStatsApi } from "../api/travstats";
import { Banner } from "../components/Banner";

const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="28" r="12" />
        <ellipse cx="24" cy="28" rx="5" ry="12" />
        <path d="M12 28h24" />
        <path d="M13 17c4-8 16-10 22-3" />
        <path d="M35 14l-5-.5M35 14l-1.5 5" />
      </svg>
    </div>
  );
}

function IconField({ label, icon, trailing, children }: { label: string; icon: ReactNode; trailing?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-icon">
        {icon}
        {children(id)}
        {trailing}
      </div>
    </div>
  );
}

export function LoginPage({ api, onSignedIn }: { api: TravStatsApi; onSignedIn: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "code">("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  function back() {
    setStep("password");
    setCode("");
    setError(null);
  }

  return (
    <main className="login">
      <div className="login-column">
        <BrandMark />
        <h1>Citizenship Tracker</h1>
        <p className="muted login-tagline">{step === "password" ? "Your path to US citizenship, one day at a time." : "Enter the 6-digit code from your authenticator app."}</p>
        <form className="card stack" onSubmit={submit}>
          {error && <Banner tone="red">{error}</Banner>}
          {step === "password" ? (
            <>
              <IconField
                label="Username"
                icon={
                  <svg className="field-icon" {...svgProps}>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                  </svg>
                }
              >
                {(id) => <input id={id} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />}
              </IconField>
              <IconField
                label="Password"
                icon={
                  <svg className="field-icon" {...svgProps}>
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                }
                trailing={
                  <button type="button" className="toggle-visibility" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)}>
                    <svg {...svgProps}>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                      {showPassword && <path d="M4 4l16 16" />}
                    </svg>
                  </button>
                }
              >
                {(id) => <input id={id} type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
              </IconField>
            </>
          ) : (
            <label className="field">
              6-digit code
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
          )}
          <button className="button primary login-submit" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Signing in…
              </>
            ) : step === "password" ? (
              "Sign in"
            ) : (
              "Verify"
            )}
          </button>
          {step === "code" && (
            <button type="button" className="link-button" onClick={back}>
              Back
            </button>
          )}
        </form>
        <p className="login-footer">Uses your TravStats account · Estimate, not legal advice.</p>
      </div>
    </main>
  );
}
