import { useState, type FormEvent } from "react";
import { AuthError } from "../api/client";
import type { TravStatsApi } from "../api/travstats";
import { Banner } from "../components/Banner";
import { isDay } from "../domain/dates";
import { PATH_RULES, type Path } from "../domain/rules";
import type { TravelData } from "../state/loadTravelData";

export function SettingsPage({ data, api, onSaved }: { data: TravelData; api: TravStatsApi; onSaved: () => Promise<void> }) {
  const [greenCardDate, setGreenCardDate] = useState(data.settings?.greenCardDate ?? "");
  const [path, setPath] = useState<Path>(data.settings?.path ?? "spouse3");
  const [displayName, setDisplayName] = useState(data.settings?.displayName ?? "");
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!isDay(greenCardDate)) {
      setMessage({ tone: "red", text: "Enter your green card date." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const name = displayName.trim();
      await api.saveSettings({ greenCardDate, path, ...(name ? { displayName: name } : {}) });
      await onSaved();
      setMessage({ tone: "green", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "red", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch (err) {
      // An AuthError means the session is already gone, which is the goal.
      if (!(err instanceof AuthError)) {
        setMessage({ tone: "red", text: (err as Error).message });
        return;
      }
    }
    await onSaved();
  }

  return (
    <div className="stack">
      <h1>Settings</h1>
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      <form className="card stack" onSubmit={save} noValidate>
        <label className="field">
          Green card date
          <input type="date" value={greenCardDate} onChange={(e) => setGreenCardDate(e.target.value)} />
        </label>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Path to citizenship</legend>
          {(Object.keys(PATH_RULES) as Path[]).map((p) => (
            <label key={p}>
              <input type="radio" name="path" checked={path === p} onChange={() => setPath(p)} /> {PATH_RULES[p].label}
            </label>
          ))}
        </fieldset>
        <label className="field">
          Name shown on Home (optional)
          <input value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <button className="button primary" disabled={busy}>
          Save
        </button>
      </form>
      <div className="card stack">
        <p className="muted">Signed in to TravStats as {data.user.username}.</p>
        <button className="button ghost" onClick={() => void logout()}>
          Log out
        </button>
      </div>
    </div>
  );
}
