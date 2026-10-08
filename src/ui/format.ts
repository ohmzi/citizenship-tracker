import { diffYMD, yearOf, type Day } from "../domain/dates";

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
const AVG_MONTH_DAYS = 30.4375;

/** "2 years 7 months 27 days" — calendar difference, zero parts left out. */
export function formatYMD(from: Day, to: Day): string {
  const { years, months, days } = diffYMD(from, to);
  const parts: string[] = [];
  if (years) parts.push(plural(years, "year"));
  if (months) parts.push(plural(months, "month"));
  if (days || parts.length === 0) parts.push(plural(days, "day"));
  return parts.join(" ");
}

/** "1 mo 6 d" for a count of days, using an average month; under a month stays in days. */
export function formatDayCount(n: number): string {
  if (n < 0) return `-${formatDayCount(-n)}`;
  const months = Math.floor(n / AVG_MONTH_DAYS);
  if (months === 0) return plural(n, "day");
  return `${months} mo ${Math.floor(n - months * AVG_MONTH_DAYS)} d`;
}

const asUtc = (day: Day) => new Date(`${day}T00:00:00Z`);
const LONG = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

export const formatLongDay = (day: Day): string => LONG.format(asUtc(day));

export function formatRange(leave: Day, ret: Day | null): string {
  const start = SHORT.format(asUtc(leave));
  if (ret === null) return `${start}, ${yearOf(leave)} - return not logged`;
  const end = SHORT.format(asUtc(ret));
  return yearOf(leave) === yearOf(ret)
    ? `${start} - ${end}, ${yearOf(ret)}`
    : `${start}, ${yearOf(leave)} - ${end}, ${yearOf(ret)}`;
}

export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
