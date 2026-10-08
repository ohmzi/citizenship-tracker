import { useEffect, useId, useState, type FormEvent } from "react";
import type { TripInput } from "../api/travstats";
import { TAG_ABSENCE, TAG_APP, TAG_AUTO, TAG_IGNORED } from "../domain/absences";
import { PICKER_COUNTRIES } from "../domain/countries";
import { isDay } from "../domain/dates";
import { isUsJurisdiction } from "../domain/rules";
import type { Absence } from "../domain/types";
import { tripName } from "../sync/reconcile";
import { Banner } from "./Banner";

export interface TripForm {
  countries: string[];
  leave: string;
  ret: string;
}

export function validateTripForm(form: TripForm, today: string): string | null {
  if (form.countries.length === 0) return "Choose a country.";
  if (form.countries.some(isUsJurisdiction)) return "Time in the US or a US territory isn't an absence.";
  if (!isDay(form.leave)) return "Enter the departure date.";
  // A planned trip with no return would count 0 days abroad.
  if (form.leave > today && !form.ret) return "Add the return date for a planned trip.";
  if (form.ret && !isDay(form.ret)) return "Enter a valid return date.";
  if (form.ret && form.ret < form.leave) return "The return date can't be before the departure date.";
  return null;
}

/** `existingTags` empty means a new trip, which is marked as this app's. Edits keep their tags. */
export function toTripInput(form: TripForm, existingTags: string[]): TripInput {
  const kept = existingTags.filter((t) => t !== TAG_AUTO && t !== TAG_ABSENCE);
  return {
    name: tripName(form.countries),
    countries: form.countries,
    startDate: form.leave,
    endDate: form.ret || null,
    tags: existingTags.length === 0 ? [TAG_ABSENCE, TAG_APP] : [TAG_ABSENCE, ...kept],
  };
}

/**
 * "Don't count": the trip stays in TravStats. Used for every trip this app
 * didn't create (it may hold photos, journal or expenses) and for flight-made
 * trips (their flights would recreate them).
 */
export function ignoreTags(existingTags: string[]): string[] {
  return [...existingTags.filter((t) => t !== TAG_ABSENCE), TAG_IGNORED];
}

export function TripSheet({
  initial,
  greenCardDate,
  today,
  canDelete,
  onSave,
  onRemove,
  onClose,
}: {
  initial: Absence | null;
  greenCardDate: string | null;
  today: string;
  /** Only a trip this app created, and not one made from flights, may really be deleted. */
  canDelete: boolean;
  onSave: (form: TripForm) => Promise<void>;
  onRemove?: () => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TripForm>({
    countries: initial?.countries ?? [],
    leave: initial?.leave ?? "",
    ret: initial?.return ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingId = useId();
  const returnHintId = useId();
  const removeLabel = canDelete ? "Delete trip" : "Don't count this trip";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateTripForm(form, today);
    if (problem) setError(problem);
    else void run(() => onSave(form));
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        noValidate
      >
        <div className="sheet-head">
          <h1 id={headingId}>{initial ? "Edit Trip" : "Add Trip"}</h1>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {error && <Banner tone="red">{error}</Banner>}
        <label className="field">
          Country
          <select
            value={form.countries.length === 1 ? form.countries[0] : ""}
            onChange={(e) => setForm({ ...form, countries: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">{form.countries.length > 1 ? tripName(form.countries) : "Select country"}</option>
            {PICKER_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="date-row">
          <label className="field">
            Departure Date
            <input type="date" value={form.leave} onChange={(e) => setForm({ ...form, leave: e.target.value })} />
          </label>
          <div className="stack date-return">
            <label className="field">
              Return Date
              <input
                type="date"
                value={form.ret}
                min={form.leave || undefined}
                aria-describedby={returnHintId}
                onChange={(e) => setForm({ ...form, ret: e.target.value })}
              />
            </label>
            <p id={returnHintId} className="muted" style={{ margin: 0 }}>
              Leave empty only if you're abroad right now.
            </p>
          </div>
        </div>
        {greenCardDate && form.leave && form.leave < greenCardDate && (
          <p className="muted">This trip starts before your green card date; only the days after it affect your count.</p>
        )}
        <button className="button primary" disabled={busy}>
          Save Trip
        </button>
        {onRemove && (
          <button type="button" className="button ghost" disabled={busy} onClick={() => void run(onRemove)}>
            {removeLabel}
          </button>
        )}
      </form>
    </div>
  );
}
