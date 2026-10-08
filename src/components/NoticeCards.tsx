import { Link } from "react-router-dom";
import type { Absence } from "../domain/types";
import type { Warning } from "../domain/presence";
import type { Notice } from "../sync/flightPairing";
import { formatRange } from "../ui/format";
import { Banner } from "./Banner";

const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const short = (day: string) => SHORT.format(new Date(`${day}T00:00:00Z`));

/** Compile-time proof that a switch handled every kind. */
function unhandled(value: never): never {
  throw new Error(`Unhandled notice: ${JSON.stringify(value)}`);
}

function warningCard(w: Warning, label: (id: string) => string): JSX.Element {
  switch (w.kind) {
    case "breaks_residence":
      return (
        <Banner key={`b${w.absenceId}`} tone="red">
          {label(w.absenceId)} is {w.abroadDays} days abroad. An absence of a year or more breaks continuous residence.
        </Banner>
      );
    case "presumed_break":
      return (
        <Banner key={`p${w.absenceId}`} tone="amber">
          {label(w.absenceId)} is {w.abroadDays} days abroad. Over 6 months, USCIS presumes a break in continuous residence unless you can show otherwise.
        </Banner>
      );
    case "return_not_logged":
      return (
        <Banner key={`r${w.absenceId}`} tone="amber">
          {label(w.absenceId)} has no return logged, so it counts as abroad through today.
        </Banner>
      );
    case "planned_without_return":
      return (
        <Banner key={`n${w.absenceId}`} tone="amber">
          {label(w.absenceId)} has no return date, so its days abroad aren't counted yet. Add the return flight or date.
        </Banner>
      );
    default:
      return unhandled(w);
  }
}

function noticeCard(n: Notice): JSX.Element {
  switch (n.kind) {
    case "orphan_entry":
      return (
        <Banner key={`o${n.flightId}`} tone="amber">
          You arrived in the US on {short(n.day)} but no departure is logged. <Link to="/trips">Add the trip</Link>.
        </Banner>
      );
    case "return_assumed":
      return (
        <Banner key={`a${n.flightId}`} tone="amber">
          You left the US again on {short(n.day)} without a logged way back, so the trip before it is assumed to end that day.
        </Banner>
      );
    case "date_uncertain":
      return (
        <Banner key={`u${n.flightId}`} tone="amber">
          A flight's date is uncertain in TravStats — check it so your count stays right.
        </Banner>
      );
    case "flight_incomplete":
      return (
        <Banner key={`i${n.flightId}`} tone="amber">
          A flight in TravStats is missing its date or airport country, so it can't be counted. Check it in TravStats.
        </Banner>
      );
    case "dates_mismatch":
      return (
        <Banner key={`m${n.tripId}-${n.flightLeave}`} tone="amber">
          Your flights show {formatRange(n.flightLeave, n.flightReturn)}, but {n.tripName} says {formatRange(n.tripStart, n.tripEnd)}. Edit the trip if the flights are right.
        </Banner>
      );
    default:
      return unhandled(n);
  }
}

export function NoticeCards({
  warnings,
  notices,
  absences,
  reviewCount,
}: {
  warnings: Warning[];
  notices: Notice[];
  absences: Absence[];
  reviewCount: number;
}) {
  const byId = new Map(absences.map((a) => [a.id, a]));
  const label = (id: string) => {
    const a = byId.get(id);
    return a ? `${a.name} (${formatRange(a.leave, a.return)})` : "A trip";
  };
  return (
    <>
      {warnings.map((w) => warningCard(w, label))}
      {notices.map(noticeCard)}
      {reviewCount > 0 && (
        <Banner tone="amber">
          {reviewCount} TravStats {reviewCount === 1 ? "trip needs" : "trips need"} review. <Link to="/trips">Open Trips</Link>.
        </Banner>
      )}
    </>
  );
}
