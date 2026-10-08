import { Link } from "react-router-dom";
import type { Absence } from "../domain/types";
import type { Warning } from "../domain/presence";
import type { Notice } from "../sync/flightPairing";
import { formatRange } from "../ui/format";
import { Banner } from "./Banner";

const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const short = (day: string) => SHORT.format(new Date(`${day}T00:00:00Z`));

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
      {warnings.map((w) =>
        w.kind === "breaks_residence" ? (
          <Banner key={`b${w.absenceId}`} tone="red">
            {label(w.absenceId)} is {w.abroadDays} days abroad. An absence of a year or more breaks continuous residence.
          </Banner>
        ) : w.kind === "presumed_break" ? (
          <Banner key={`p${w.absenceId}`} tone="amber">
            {label(w.absenceId)} is {w.abroadDays} days abroad. Over 6 months, USCIS presumes a break in continuous residence unless you can show otherwise.
          </Banner>
        ) : (
          <Banner key={`r${w.absenceId}`} tone="amber">
            {label(w.absenceId)} has no return logged, so it counts as abroad through today.
          </Banner>
        )
      )}
      {notices.map((n) =>
        n.kind === "orphan_entry" ? (
          <Banner key={`o${n.flightId}`} tone="amber">
            You arrived in the US on {short(n.day)} but no departure is logged. <Link to="/trips">Add the trip</Link>.
          </Banner>
        ) : n.kind === "return_assumed" ? (
          <Banner key={`a${n.flightId}`} tone="amber">
            You left the US again on {short(n.day)} without a logged way back, so the trip before it is assumed to end that day.
          </Banner>
        ) : (
          <Banner key={`u${n.flightId}`} tone="amber">
            A flight's date is uncertain in TravStats — check it so your count stays right.
          </Banner>
        )
      )}
      {reviewCount > 0 && (
        <Banner tone="amber">
          {reviewCount} TravStats {reviewCount === 1 ? "trip needs" : "trips need"} review. <Link to="/trips">Open Trips</Link>.
        </Banner>
      )}
    </>
  );
}
