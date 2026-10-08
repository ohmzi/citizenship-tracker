import { flagEmoji } from "../domain/countries";
import { abroadDays } from "../domain/presence";
import type { Absence } from "../domain/types";
import { tripName } from "../sync/reconcile";
import { formatRange } from "../ui/format";

export function TripRow({ absence, today, onClick }: { absence: Absence; today: string; onClick: () => void }) {
  const days = abroadDays(absence, today);
  return (
    <button type="button" className="card trip-row" onClick={onClick}>
      <span className="flag" aria-hidden="true">
        {flagEmoji(absence.countries[0] ?? "")}
      </span>
      <span className="grow">
        <h3>{absence.countries.length ? tripName(absence.countries) : absence.name}</h3>
        <span className="muted">{formatRange(absence.leave, absence.return)}</span>
        {absence.leave > today && <span className="badge">planned</span>}
        {absence.source === "auto" && <span className="badge">from flights</span>}
        {absence.return === null && <span className="badge">return not logged</span>}
      </span>
      <span className="days">
        {days} {days === 1 ? "day" : "days"}
      </span>
    </button>
  );
}
