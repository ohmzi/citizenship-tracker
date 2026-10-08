import type { NextTrip } from "../domain/presence";
import { tripName } from "../sync/reconcile";

export function NextTripCard({ trip }: { trip: NextTrip }) {
  const name = trip.absence.countries.length ? tripName(trip.absence.countries) : trip.absence.name;
  return (
    <section className="card row-card">
      <span className="row-icon" aria-hidden="true">
        🗓️
      </span>
      <div>
        <h3>
          Your {name} trip is in {trip.daysUntil} {trip.daysUntil === 1 ? "day" : "days"}
        </h3>
        <p>
          Departs in <b>{trip.daysUntil}</b> days - <b>{trip.abroadDays} days</b> abroad
        </p>
      </div>
    </section>
  );
}
