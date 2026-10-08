import type { CountedTrip } from "../domain/presence";
import { tripName } from "../sync/reconcile";
import { formatRange } from "../ui/format";

export function TripsThatCount({ trips }: { trips: CountedTrip[] }) {
  return (
    <section className="card row-card">
      <span className="row-icon" aria-hidden="true">
        🕒
      </span>
      <div>
        <h3>Trips that count when applying for citizenship</h3>
        {trips.length === 0 && <p>No trips yet.</p>}
        {trips.map(({ absence, calendarDays, abroadDays }) => (
          <p key={absence.id}>
            <b>{absence.countries.length ? tripName(absence.countries) : absence.name}</b>: {formatRange(absence.leave, absence.return)},{" "}
            <b>{calendarDays} days</b> trip ({abroadDays} USCIS days)
          </p>
        ))}
      </div>
    </section>
  );
}
