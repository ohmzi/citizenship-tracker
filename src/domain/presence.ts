import { addDays, addYears, daysBetween, maxDay, minDay, yearOf, type Day } from "./dates";
import { BREAK_DAYS, EARLY_FILING_DAYS, PATH_RULES, PRESUMED_BREAK_DAYS } from "./rules";
import type { Absence, Settings } from "./types";

export type Warning =
  | { kind: "presumed_break"; absenceId: string; abroadDays: number }
  | { kind: "breaks_residence"; absenceId: string; abroadDays: number }
  | { kind: "return_not_logged"; absenceId: string };

export interface CountedTrip {
  absence: Absence;
  calendarDays: number;
  abroadDays: number;
}

export interface NextTrip extends CountedTrip {
  daysUntil: number;
}

export interface YearBar {
  year: number;
  present: number;
  elapsed: number;
}

export type PresenceStatus = "on_track" | "at_risk" | "behind";

export interface Summary {
  greenCardDate: Day;
  earliestFilingDate: Day;
  /** First day presence meets the requirement, or null if not within ~10 years. */
  projectedApplyDate: Day | null;
  requiredDays: number;
  requiredMonths: number;
  daysAsPermanentResident: number;
  daysInUsSoFar: number;
  daysAbroadSoFar: number;
  plannedAbroadDays: number;
  /** Days that could still be spent abroad without moving the earliest filing date. */
  roomLeftDays: number;
  countdownDays: number | null;
  /** daysInUsSoFar / requiredDays, capped at 1. */
  progress: number;
  yearBars: YearBar[];
  tripsThatCount: CountedTrip[];
  nextTrip: NextTrip | null;
  warnings: Warning[];
  status: PresenceStatus;
}

const HORIZON_DAYS = 3650;

/** The days spent outside the US: strictly after leaving, strictly before returning. */
export function abroadRange(a: Absence, today: Day): { from: Day; to: Day } | null {
  const from = addDays(a.leave, 1);
  const to = a.return === null ? today : addDays(a.return, -1);
  return from <= to ? { from, to } : null;
}

export function abroadDays(a: Absence, today: Day): number {
  const range = abroadRange(a, today);
  return range ? daysBetween(range.from, range.to) + 1 : 0;
}

/**
 * Abroad days of `a` on or after `from`. Residence warnings use it with the
 * green card date: days abroad before permanent residence never break it.
 */
export function abroadDaysSince(a: Absence, from: Day, today: Day): number {
  const range = abroadRange(a, today);
  if (!range) return 0;
  const start = maxDay(range.from, from);
  return start <= range.to ? daysBetween(start, range.to) + 1 : 0;
}

function calendarDays(a: Absence, today: Day): number {
  const end = a.return ?? today;
  return end < a.leave ? 1 : daysBetween(a.leave, end) + 1;
}

/** Abroad days as a bitmap over [origin, end] with prefix sums, so any range is O(1). */
function buildAbroadIndex(origin: Day, end: Day, absences: Absence[], today: Day) {
  const length = daysBetween(origin, end) + 1;
  const abroad = new Uint8Array(length);
  for (const a of absences) {
    const range = abroadRange(a, today);
    if (!range) continue;
    const from = Math.max(0, daysBetween(origin, range.from));
    const to = Math.min(length - 1, daysBetween(origin, range.to));
    for (let i = from; i <= to; i++) abroad[i] = 1;
  }
  const prefix = new Int32Array(length + 1);
  for (let i = 0; i < length; i++) prefix[i + 1] = prefix[i]! + abroad[i]!;
  return {
    /** Abroad days in [from, to], inclusive, clamped to the index. */
    count(from: Day, to: Day): number {
      const i = Math.max(0, daysBetween(origin, from));
      const j = Math.min(length - 1, daysBetween(origin, to));
      return j < i ? 0 : prefix[j + 1]! - prefix[i]!;
    },
  };
}

export function computeSummary(settings: Settings, absences: Absence[], today: Day): Summary {
  const rule = PATH_RULES[settings.path];
  const P = settings.greenCardDate;
  const E = addDays(addYears(P, rule.years), -EARLY_FILING_DAYS);
  const horizon = addDays(maxDay(E, today), HORIZON_DAYS);
  const index = buildAbroadIndex(P, horizon, absences, today);

  // Presence counted toward filing on day d: the window ends AT the filing date.
  const presenceOn = (d: Day): number => {
    if (d < P) return 0;
    const start = maxDay(P, addYears(d, -rule.years));
    return daysBetween(start, d) + 1 - index.count(start, d);
  };

  let projectedApplyDate: Day | null = null;
  for (let d = E; d <= horizon; d = addDays(d, 1)) {
    if (presenceOn(d) >= rule.requiredDays) {
      projectedApplyDate = d;
      break;
    }
  }

  const started = today >= P;
  const daysAsPermanentResident = started ? daysBetween(P, today) + 1 : 0;
  const daysInUsSoFar = presenceOn(today);
  const daysAbroadSoFar = started ? index.count(P, today) : 0;
  const plannedAbroadDays = index.count(started ? addDays(today, 1) : P, horizon);
  const roomLeftDays = daysBetween(P, E) + 1 - rule.requiredDays - index.count(P, E);
  const countdownDays =
    projectedApplyDate === null ? null : Math.max(0, daysBetween(today, projectedApplyDate));

  const yearBars: YearBar[] = [];
  if (started) {
    for (let year = yearOf(P); year <= yearOf(today); year++) {
      const start = maxDay(P, `${year}-01-01`);
      const end = minDay(today, `${year}-12-31`);
      const elapsed = daysBetween(start, end) + 1;
      yearBars.push({ year, present: elapsed - index.count(start, end), elapsed });
    }
  }

  const sorted = [...absences].sort((a, b) => (a.leave < b.leave ? -1 : a.leave > b.leave ? 1 : 0));
  const counted = (a: Absence): CountedTrip => ({
    absence: a,
    calendarDays: calendarDays(a, today),
    abroadDays: abroadDays(a, today),
  });

  const target = projectedApplyDate ?? E;
  const windowStart = maxDay(P, addYears(target, -rule.years));
  const tripsThatCount = sorted
    .filter((a) => a.leave <= target && (a.return ?? today) >= windowStart)
    .map(counted);

  const upcoming = sorted.find((a) => a.leave > today);
  const nextTrip = upcoming
    ? { ...counted(upcoming), daysUntil: daysBetween(today, upcoming.leave) }
    : null;

  const warnings: Warning[] = [];
  for (const a of sorted) {
    const n = abroadDaysSince(a, P, today);
    if (n >= BREAK_DAYS) warnings.push({ kind: "breaks_residence", absenceId: a.id, abroadDays: n });
    else if (n > PRESUMED_BREAK_DAYS) warnings.push({ kind: "presumed_break", absenceId: a.id, abroadDays: n });
    if (a.return === null) warnings.push({ kind: "return_not_logged", absenceId: a.id });
  }

  const status: PresenceStatus =
    projectedApplyDate === null || projectedApplyDate > E
      ? "behind"
      : warnings.some((w) => w.kind !== "return_not_logged")
        ? "at_risk"
        : "on_track";

  return {
    greenCardDate: P,
    earliestFilingDate: E,
    projectedApplyDate,
    requiredDays: rule.requiredDays,
    requiredMonths: rule.requiredMonths,
    daysAsPermanentResident,
    daysInUsSoFar,
    daysAbroadSoFar,
    plannedAbroadDays,
    roomLeftDays,
    countdownDays,
    progress: Math.min(1, daysInUsSoFar / rule.requiredDays),
    yearBars,
    tripsThatCount,
    nextTrip,
    warnings,
    status,
  };
}
