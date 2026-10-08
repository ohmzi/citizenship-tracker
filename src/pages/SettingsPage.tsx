import { useState, type FormEvent } from "react";
import { AuthError } from "../api/client";
import type { TravStatsApi } from "../api/travstats";
import { Banner } from "../components/Banner";
import { isDay } from "../domain/dates";
import { formatLongDay } from "../ui/format";
import { PATH_RULES, type Path } from "../domain/rules";
import type { TravelData } from "../state/loadTravelData";

export function SettingsPage({ data, api, onSaved }: { data: TravelData; api: TravStatsApi; onSaved: () => Promise<void> }) {
  // The date last saved. Once it exists the field stays locked until the owner opts in to editing it.
  const [savedDate, setSavedDate] = useState<string | null>(data.settings?.greenCardDate ?? null);
  const [greenCardDate, setGreenCardDate] = useState(data.settings?.greenCardDate ?? "");
  const [editStep, setEditStep] = useState<"locked" | "warning" | "unlocked">("locked");
  const [confirming, setConfirming] = useState(false);
  const [path, setPath] = useState<Path>(data.settings?.path ?? "spouse3");
  const [displayName, setDisplayName] = useState(data.settings?.displayName ?? "");
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const locked = savedDate !== null && editStep !== "unlocked";

  function relock() {
    setGreenCardDate(savedDate ?? "");
    setEditStep("locked");
    setConfirming(false);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!isDay(greenCardDate)) {
      setMessage({ tone: "red", text: "Enter your green card date." });
      return;
    }
    if (savedDate !== null && greenCardDate !== savedDate) {
      setMessage(null);
      setConfirming(true);
      return;
    }
    void persist();
  }

  async function persist() {
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    try {
      const name = displayName.trim();
      await api.saveSettings({ greenCardDate, path, ...(name ? { displayName: name } : {}) });
      setSavedDate(greenCardDate);
      setEditStep("locked");
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
        {locked ? (
          <div className="field">
            Green card date
            <div className="locked-date">
              <span>{`🔒 ${formatLongDay(savedDate)}`}</span>
              <button type="button" className="button ghost" onClick={() => setEditStep("warning")}>
                Edit
              </button>
            </div>
          </div>
        ) : (
          <label className="field">
            Green card date
            <input type="date" value={greenCardDate} onChange={(e) => setGreenCardDate(e.target.value)} />
          </label>
        )}
        {savedDate === null && (
          <p className="muted" style={{ margin: 0 }}>
            Use the <em>Resident since</em> date on your green card.
          </p>
        )}
        {locked && editStep === "warning" && (
          <Banner tone="amber">
            <div className="stack">
              <p>Your green card date drives every number in this app: your apply date, days in the USA and which trips count. Only change it if it's wrong.</p>
              <div className="banner-actions">
                <button type="button" className="button ghost" onClick={relock}>
                  Cancel
                </button>
                <button type="button" className="button primary" onClick={() => setEditStep("unlocked")}>
                  Unlock
                </button>
              </div>
            </div>
          </Banner>
        )}
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
        {confirming && savedDate !== null && (
          <Banner tone="red">
            <div className="stack">
              <p>{`Change your green card date from ${formatLongDay(savedDate)} to ${formatLongDay(greenCardDate)}? This recalculates your entire timeline. Be very careful.`}</p>
              <div className="banner-actions">
                <button type="button" className="button ghost" onClick={relock}>
                  Cancel
                </button>
                <button type="button" className="button primary" disabled={busy} onClick={() => void persist()}>
                  Yes, change it
                </button>
              </div>
            </div>
          </Banner>
        )}
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
