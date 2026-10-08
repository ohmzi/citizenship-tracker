import { addDays, type Day } from "../domain/dates";
import { formatLongDay, formatYMD } from "../ui/format";

export function HeroCard({ greenCardDate, today }: { greenCardDate: Day; today: Day }) {
  const started = today >= greenCardDate;
  return (
    <section className="card card-dark">
      <p className="hero-title">Time as Permanent Resident</p>
      <p className="hero-value">{started ? formatYMD(greenCardDate, addDays(today, 1)) : "Not started yet"}</p>
      <p>{started ? `(since ${formatLongDay(greenCardDate)})` : `(starts ${formatLongDay(greenCardDate)})`}</p>
    </section>
  );
}
