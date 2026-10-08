import { useState } from "react";
import type { TravStatsApi } from "../api/travstats";
import { Banner } from "../components/Banner";
import { TripRow } from "../components/TripRow";
import { TripSheet, ignoreTags, toTripInput, type TripForm } from "../components/TripSheet";
import { TAG_ABSENCE, TAG_APP, TAG_AUTO, TAG_IGNORED, visibleForResidency } from "../domain/absences";
import type { Absence } from "../domain/types";
import type { TravelData } from "../state/loadTravelData";
import { formatRange } from "../ui/format";
import { tripName } from "../sync/reconcile";

export function TripsPage({ data, api, onChanged }: { data: TravelData; api: TravStatsApi; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<Absence | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tagsOf = (id: string) => data.trips.find((t) => t.id === id)?.tags ?? [];
  const canDelete = (id: string) => {
    const tags = tagsOf(id);
    return tags.includes(TAG_APP) && !tags.includes(TAG_AUTO);
  };
  const visible = visibleForResidency(data.classification, data.settings?.greenCardDate ?? null, data.today);
  const absences = [...visible.absences].sort((a, b) => (a.leave < b.leave ? 1 : -1));
  const nameOf = (id: string) => {
    const a = visible.absences.find((x) => x.id === id);
    return a ? (a.countries.length ? tripName(a.countries) : a.name) : id;
  };

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function save(form: TripForm) {
    if (editing === "new") await api.createTrip(toTripInput(form, []));
    else if (editing) {
      // An edit is never a new trip: empty tags (an untagged TravStats trip,
      // or tags not reloaded yet) must not earn this app's delete marker.
      const tags = tagsOf(editing.id);
      await api.updateTrip(editing.id, toTripInput(form, tags.length > 0 ? tags : [TAG_ABSENCE]));
    }
    setEditing(null);
    await onChanged();
  }

  async function remove() {
    if (!editing || editing === "new") return;
    if (canDelete(editing.id)) {
      if (!window.confirm("Delete this trip from TravStats? This can't be undone.")) return;
      await api.deleteTrip(editing.id);
    } else {
      await api.updateTrip(editing.id, { tags: ignoreTags(tagsOf(editing.id)) });
    }
    setEditing(null);
    await onChanged();
  }

  return (
    <div className="stack">
      <div className="trips-header">
        <div className="segmented">
          <button type="button" className="seg active">
            Trips
          </button>
          <button type="button" className="seg" disabled title="Coming soon">
            What if?
          </button>
        </div>
        <button type="button" className="fab" aria-label="Add trip" onClick={() => setEditing("new")}>
          +
        </button>
      </div>
      {error && <Banner tone="red">{error}</Banner>}
      {absences.length === 0 && <p className="muted center">No trips yet. Tap + to add one.</p>}
      {absences.map((a) => (
        <TripRow key={a.id} absence={a} today={data.today} onClick={() => setEditing(a)} />
      ))}
      {(visible.review.length > 0 || visible.overlaps.length > 0) && (
        <section className="stack">
          <h2>Needs review</h2>
          <p className="muted">These TravStats trips might include time outside the US.</p>
          {visible.overlaps.map(([a, b]) => (
            <Banner key={`${a}-${b}`} tone="amber">
              {nameOf(a)} and {nameOf(b)} overlap — shared days are counted once.
            </Banner>
          ))}
          {visible.review.map((t) => (
            <div key={t.id} className="card stack">
              <b>{t.name}</b>
              <span className="muted">
                {t.startDay ? formatRange(t.startDay, t.endDay) : "No dates"} · {t.countries.join(", ") || "no countries"}
              </span>
              <div className="trips-header">
                <button
                  type="button"
                  className="button primary"
                  onClick={() =>
                    void act(() => api.updateTrip(t.id, { tags: t.tags.includes(TAG_ABSENCE) ? t.tags : [...t.tags, TAG_ABSENCE] }))
                  }
                >
                  Count
                </button>
                <button type="button" className="button ghost" onClick={() => void act(() => api.updateTrip(t.id, { tags: [...t.tags, TAG_IGNORED] }))}>
                  Ignore
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      {editing && (
        <TripSheet
          initial={editing === "new" ? null : editing}
          greenCardDate={data.settings?.greenCardDate ?? null}
          today={data.today}
          canDelete={editing !== "new" && canDelete(editing.id)}
          onSave={save}
          onRemove={editing === "new" ? undefined : remove}
          onClose={() => setEditing(null)}
        />
      )}
      <footer className="fineprint">Estimate, not legal advice.</footer>
    </div>
  );
}
