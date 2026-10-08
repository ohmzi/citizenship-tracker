import { useState, type FormEvent } from "react";
import { AuthError } from "../api/client";
import type { TravStatsApi } from "../api/travstats";
import { Banner } from "../components/Banner";
import { addDays, addYears, isDay } from "../domain/dates";
import { formatLongDay } from "../ui/format";
import { PATH_RULES, type Path } from "../domain/rules";
import type { TravelData } from "../state/loadTravelData";

const PATHS = Object.keys(PATH_RULES) as Path[];
const EARLY_FILING_DAYS = 90;

const GUARD_TEXT =
  "Your green card date drives every number in this app: your apply date, days in the USA and which trips count. Only change it if it's wrong.";

type Step = "locked" | "warning" | "unlocked";

export function SettingsPage({ data, api, onSaved }: { data: TravelData; api: TravStatsApi; onSaved: () => Promise<void> }) {
  // What was last saved. Once it exists, the date and path stay locked until the owner opts in to editing them.
  const [savedDate, setSavedDate] = useState<string | null>(data.settings?.greenCardDate ?? null);
  const [savedPath, setSavedPath] = useState<Path | null>(data.settings?.path ?? null);
  const [savedName, setSavedName] = useState(data.settings?.displayName ?? "");

  const [greenCardDate, setGreenCardDate] = useState(data.settings?.greenCardDate ?? "");
  const [path, setPath] = useState<Path>(data.settings?.path ?? "spouse3");
  const [displayName, setDisplayName] = useState(data.settings?.displayName ?? "");

  const [dateStep, setDateStep] = useState<Step>("locked");
  const [pathStep, setPathStep] = useState<Step>("locked");
  const [editingName, setEditingName] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const dateLocked = savedDate !== null && dateStep !== "unlocked";
  const pathLocked = savedPath !== null && pathStep !== "unlocked";
  const nameLocked = savedName !== "" && !editingName;

  const dateChanged = savedDate !== null && greenCardDate !== savedDate;
  const pathChanged = savedPath !== null && path !== savedPath;
  const nameChanged = displayName.trim() !== savedName;
  const dirty = savedDate === null ? isDay(greenCardDate) : dateChanged || pathChanged || nameChanged;

  const earliestFiling = isDay(greenCardDate) ? addDays(addYears(greenCardDate, PATH_RULES[path].years), -EARLY_FILING_DAYS) : null;

  function relockDate() {
    setGreenCardDate(savedDate ?? "");
    setDateStep("locked");
    setConfirming(false);
  }

  function relockPath() {
    setPath(savedPath ?? "spouse3");
    setPathStep("locked");
    setConfirming(false);
  }

  function cancelConfirmation() {
    relockDate();
    relockPath();
  }

  function cancelNameEdit() {
    setDisplayName(savedName);
    setEditingName(false);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!isDay(greenCardDate)) {
      setMessage({ tone: "red", text: "Enter your green card date." });
      return;
    }
    if (dateChanged || pathChanged) {
      setMessage(null);
      setConfirming(true);
      return;
    }
    void persist();
  }

  async function persist() {
    if (!isDay(greenCardDate)) {
      setConfirming(false);
      setMessage({ tone: "red", text: "Enter your green card date." });
      return;
    }
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    try {
      const name = displayName.trim();
      await api.saveSettings({ greenCardDate, path, ...(name ? { displayName: name } : {}) });
      setSavedDate(greenCardDate);
      setSavedPath(path);
      setSavedName(name);
      setDisplayName(name);
      setEditingName(false);
      setDateStep("locked");
      setPathStep("locked");
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

  const guard = (onCancel: () => void, onUnlock: () => void, cancelLabel?: string, unlockLabel?: string) => (
    <Banner tone="amber">
      <div className="stack">
        <p>{GUARD_TEXT}</p>
        <div className="banner-actions">
          <button type="button" className="button neutral" aria-label={cancelLabel} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button primary" aria-label={unlockLabel} onClick={onUnlock}>
            Unlock
          </button>
        </div>
      </div>
    </Banner>
  );

  const showSaveBar = dirty && !confirming;

  return (
    <div className={showSaveBar ? "stack has-save-bar" : "stack"}>
      <h1>Settings</h1>
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      <form className="stack" onSubmit={save} noValidate>
        <section className="card stack" aria-labelledby="settings-residency">
          <h2 className="section-title" id="settings-residency">
            Residency
          </h2>

          {dateLocked ? (
            <div className="setting-row">
              <span className="muted">Green card date</span>
              <div className="row-between">
                <span>{`🔒 ${formatLongDay(savedDate)}`}</span>
                <button type="button" className="pill-button" aria-label="Edit green card date" onClick={() => setDateStep("warning")}>
                  Edit
                </button>
              </div>
            </div>
          ) : (
            <label className="field">
              Green card date
              <input
                type="date"
                value={greenCardDate}
                onChange={(e) => {
                  setGreenCardDate(e.target.value);
                  // Any edit dismisses the prompt; Save must be pressed again.
                  setConfirming(false);
                }}
              />
            </label>
          )}
          {!dateLocked && savedDate !== null && !confirming && (
            <button type="button" className="button neutral" onClick={relockDate}>
              Cancel
            </button>
          )}
          {savedDate === null && (
            <p className="muted" style={{ margin: 0 }}>
              Use the <em>Resident since</em> date on your green card.
            </p>
          )}
          {dateLocked && dateStep === "warning" && guard(relockDate, () => setDateStep("unlocked"))}

          {pathLocked ? (
            <div className="setting-row">
              <span className="muted">Path to citizenship</span>
              <div className="row-between">
                <span>{`🔒 ${PATH_RULES[path].label}`}</span>
                <button type="button" className="pill-button" aria-label="Edit path" onClick={() => setPathStep("warning")}>
                  Edit
                </button>
              </div>
            </div>
          ) : (
            <fieldset className="field choice-group">
              <legend className="muted">Path to citizenship</legend>
              {PATHS.map((p) => (
                <label key={p} className={path === p ? "choice-card selected" : "choice-card"}>
                  <input
                    type="radio"
                    name="path"
                    className="visually-hidden"
                    checked={path === p}
                    onChange={() => {
                      setPath(p);
                      setConfirming(false);
                    }}
                  />
                  <span className="choice-title">{PATH_RULES[p].label}</span>
                  <span className="muted">{`${PATH_RULES[p].requiredMonths} months in the US within ${PATH_RULES[p].years} years`}</span>
                </label>
              ))}
            </fieldset>
          )}
          {!pathLocked && savedPath !== null && !confirming && (
            <button type="button" className="button neutral" aria-label="Cancel path edit" onClick={relockPath}>
              Cancel
            </button>
          )}
          {pathLocked && pathStep === "warning" && guard(relockPath, () => setPathStep("unlocked"), "Cancel path edit", "Unlock path")}

          {earliestFiling !== null && <p className="summary-line">{`Earliest filing date: ${formatLongDay(earliestFiling)}`}</p>}
        </section>

        <section className="card stack" aria-labelledby="settings-profile">
          <h2 className="section-title" id="settings-profile">
            Profile
          </h2>
          {nameLocked ? (
            <div className="setting-row">
              <span className="muted">Name shown on Home</span>
              <div className="row-between">
                <span>{`🔒 ${savedName}`}</span>
                <button type="button" className="pill-button" aria-label="Edit name" onClick={() => setEditingName(true)}>
                  Edit
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="field">
                Name shown on Home
                <input value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
              {savedName !== "" && (
                <button type="button" className="button neutral" aria-label="Cancel name edit" onClick={cancelNameEdit}>
                  Cancel
                </button>
              )}
            </>
          )}
        </section>

        {confirming && isDay(greenCardDate) && (dateChanged || pathChanged) && (
          <Banner tone="red">
            <div className="stack">
              {dateChanged && savedDate !== null && <p>{`Change your green card date from ${formatLongDay(savedDate)} to ${formatLongDay(greenCardDate)}?`}</p>}
              {pathChanged && savedPath !== null && <p>{`Change your path from ${PATH_RULES[savedPath].label} to ${PATH_RULES[path].label}?`}</p>}
              <p>This recalculates your entire timeline. Be very careful.</p>
              <div className="banner-actions">
                <button type="button" className="button neutral" onClick={cancelConfirmation}>
                  Cancel
                </button>
                <button type="button" className="button primary" disabled={busy} onClick={() => void persist()}>
                  Yes, change it
                </button>
              </div>
            </div>
          </Banner>
        )}

        {showSaveBar && (
          <div className="save-bar">
            <button className="button primary" disabled={busy}>
              Save changes
            </button>
          </div>
        )}
      </form>

      <section className="card stack" aria-labelledby="settings-account">
        <h2 className="section-title" id="settings-account">
          Account
        </h2>
        <div className="row-between">
          <span className="signed-in">{`Signed in as ${data.user.username}`}</span>
          <button type="button" className="button ghost logout" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </section>
    </div>
  );
}
