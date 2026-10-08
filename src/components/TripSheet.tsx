import { useState, type FormEvent } from "react";
import type { TripInput } from "../api/travstats";
import { TAG_ABSENCE, TAG_AUTO, TAG_IGNORED } from "../domain/absences";
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

export function validateTripForm(form: TripForm): string | null {
  if (form.countries.length === 0) return "Choose a country.";
  if (form.countries.some(isUsJurisdiction)) return "Time in the US or a US territory isn't an absence.";
  if (!isDay(form.leave)) return "Enter the departure date.";
  if (form.ret && !isDay(form.ret)) return "Enter a valid return date.";
  if (form.ret && form.ret < form.leave) return "The return date can't be before the departure date.";
  return null;
}

export function toTripInput(form: TripForm, existingTags: string[]): TripInput {
  const kept = existingTags.filter((t) => t !== TAG_AUTO && t !== TAG_ABSENCE);
  return {
    name: tripName(form.countries),
    countries: form.countries,
    startDate: form.leave,
    endDate: form.ret || null,
    tags: [TAG_ABSENCE, ...kept],
  };
}

/** A flight-made trip is never deleted: its flights would recreate it. */
export function ignoreTags(existingTags: string[]): string[] {
  return [...existingTags.filter((t) => t !== TAG_ABSENCE), TAG_IGNORED];
}

export function TripSheet({
  initial,
  greenCardDate,
  onSave,
  onRemove,
  onClose,
}: {
  initial: Absence | null;
  greenCardDate: string | null;
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
  const removeLabel = initial?.source === "auto" ? "Don't count this trip" : "Delete trip";

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
    const problem = validateTripForm(form);
    if (problem) setError(problem);
    else void run(() => onSave(form));
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="sheet-head">
          <h1>{initial ? "Edit Trip" : "Add Trip"}</h1>
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
        <label className="field">
          Departure Date
          <input type="date" value={form.leave} onChange={(e) => setForm({ ...form, leave: e.target.value })} />
        </label>
        <label className="field">
          Return Date (leave empty if you haven't come back yet)
          <input type="date" value={form.ret} min={form.leave || undefined} onChange={(e) => setForm({ ...form, ret: e.target.value })} />
        </label>
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
