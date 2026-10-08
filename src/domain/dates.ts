/**
 * Calendar days as "YYYY-MM-DD" strings. All arithmetic is UTC so the host's
 * time zone can never shift a day; a Day never becomes a local Date.
 */
export type Day = string;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface YMD {
  years: number;
  months: number;
  days: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

function parts(day: Day): [number, number, number] {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Not a YYYY-MM-DD day: ${day}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const format = (y: number, m: number, d: number): Day => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

export function isDay(value: string): boolean {
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function toEpochDay(day: Day): number {
  const [y, m, d] = parts(day);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromEpochDay(n: number): Day {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(day: Day, n: number): Day {
  return fromEpochDay(toEpochDay(day) + n);
}

/** `to − from` in days; negative when `to` is earlier. */
export function daysBetween(from: Day, to: Day): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** Same month and day N years on; Feb 29 lands on Mar 1 in a non-leap year. */
export function addYears(day: Day, n: number): Day {
  const [y, m, d] = parts(day);
  const year = y + n;
  if (m === 2 && d === 29 && !isLeapYear(year)) return format(year, 3, 1);
  return format(year, m, d);
}

function addMonthsClamped(day: Day, n: number): Day {
  const [y, m, d] = parts(day);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return format(year, month, Math.min(d, daysInMonth(year, month)));
}

export const maxDay = (a: Day, b: Day): Day => (a > b ? a : b);
export const minDay = (a: Day, b: Day): Day => (a < b ? a : b);
export const yearOf = (day: Day): number => parts(day)[0];

/** Whole calendar years, months and days from `from` to `to` (zeros if reversed). */
export function diffYMD(from: Day, to: Day): YMD {
  if (to <= from) return { years: 0, months: 0, days: 0 };
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  let total = (ty - fy) * 12 + (tm - fm);
  if (addMonthsClamped(from, total) > to) total -= 1;
  const days = daysBetween(addMonthsClamped(from, total), to);
  return { years: Math.floor(total / 12), months: total % 12, days };
}

/** Today's calendar day in an explicit IANA zone. */
export function todayIn(timeZone: string, now: Date): Day {
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => fields.find((f) => f.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
