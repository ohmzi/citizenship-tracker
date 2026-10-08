import type { Day } from "../domain/dates";
import type { Summary } from "../domain/presence";
import { formatLongDay, formatYMD } from "../ui/format";

function ProgressRing({ progress }: { progress: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${Math.round(progress * 100)}% of required presence`}>
      <circle className="ring-track" cx="44" cy="44" r={r} fill="none" strokeWidth="8" />
      <circle
        className="ring-fill"
        cx="44"
        cy="44"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(progress, 0.02))}
        transform="rotate(-90 44 44)"
      />
    </svg>
  );
}

export function ApplyDateCard({ summary, today }: { summary: Summary; today: Day }) {
  const date = summary.projectedApplyDate;
  return (
    <section className="card card-center">
      <p className="hero-title">You can apply for Citizenship on</p>
      <p className="big-date">{date ? formatLongDay(date) : "Not within the next 10 years"}</p>
      <hr className="divider" />
      <ProgressRing progress={summary.progress} />
      <p className="hero-title">Application countdown</p>
      <p className="hero-value">{date ? formatYMD(today, date) : "—"}</p>
    </section>
  );
}
