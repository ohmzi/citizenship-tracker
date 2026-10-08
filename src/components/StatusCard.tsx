import { daysBetween } from "../domain/dates";
import type { Summary } from "../domain/presence";
import { formatDayCount, formatLongDay } from "../ui/format";

export function StatusCard({ summary }: { summary: Summary }) {
  const have = formatDayCount(summary.daysInUsSoFar);
  const need = `${summary.requiredMonths} months`;
  if (summary.status === "behind") {
    const late = summary.projectedApplyDate
      ? `${formatLongDay(summary.projectedApplyDate)}, ${daysBetween(summary.earliestFilingDate, summary.projectedApplyDate)} days after the earliest filing date`
      : "not within the next 10 years";
    return (
      <section className="card status status-amber">
        <div>
          <h3>Physical Presence in the USA</h3>
          <p>
            You have <b>{have}</b> of the <b>{need}</b> required. With your logged and planned trips you reach it on {late}.
          </p>
        </div>
      </section>
    );
  }
  const tone = summary.status === "at_risk" ? "status-amber" : "status-green";
  return (
    <section className={`card status ${tone}`}>
      <div>
        <h3>Physical Presence in the USA</h3>
        <p>
          You have <b>{have}</b> of the <b>{need}</b> required to apply for citizenship and are on track. You could spend up to{" "}
          <b>{formatDayCount(Math.max(0, summary.roomLeftDays))}</b> abroad and still meet your target citizenship application date
          (if you also maintain continuous residence).
        </p>
        {summary.status === "at_risk" && <p>One of your trips is long enough to put continuous residence at risk — see below.</p>}
      </div>
    </section>
  );
}
