import { addDays, type Day } from "./dates";
import { isUsJurisdiction } from "./rules";
import type { Absence, AbsenceSource, TripRecord } from "./types";

export const TAG_ABSENCE = "us-absence";
export const TAG_IGNORED = "us-absence-ignored";
export const TAG_AUTO = "auto";

export interface Classification {
  absences: Absence[];
  /** TravStats trips that might be absences; the user decides Count or Ignore. */
  review: TripRecord[];
  /** Untagged trips that count by rule and should be tagged in TravStats. */
  toTag: TripRecord[];
  /** Pairs of absence ids whose abroad days overlap. */
  overlaps: Array<[string, string]>;
}

export function foreignCountries(countries: string[]): string[] {
  return countries.filter((code) => !isUsJurisdiction(code));
}

function sourceOf(trip: TripRecord): AbsenceSource {
  if (trip.tags.includes(TAG_AUTO)) return "auto";
  if (trip.tags.includes(TAG_ABSENCE)) return "manual";
  return "travstats";
}

function toAbsence(trip: TripRecord, leave: Day): Absence {
  return {
    id: trip.id,
    name: trip.name,
    countries: foreignCountries(trip.countries),
    leave,
    return: trip.endDay,
    source: sourceOf(trip),
  };
}

const FAR_FUTURE = "9999-12-30";

function abroadSpan(a: Absence): [Day, Day] | null {
  const from = addDays(a.leave, 1);
  const to = a.return === null ? FAR_FUTURE : addDays(a.return, -1);
  return from <= to ? [from, to] : null;
}

export function findOverlaps(absences: Absence[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < absences.length; i++) {
    for (let j = i + 1; j < absences.length; j++) {
      const a = abroadSpan(absences[i]!);
      const b = abroadSpan(absences[j]!);
      if (a && b && a[0] <= b[1] && b[0] <= a[1]) out.push([absences[i]!.id, absences[j]!.id]);
    }
  }
  return out;
}

export function classifyTrips(trips: TripRecord[]): Classification {
  const absences: Absence[] = [];
  const review: TripRecord[] = [];
  const toTag: TripRecord[] = [];
  for (const trip of trips) {
    if (trip.tags.includes(TAG_IGNORED)) continue;
    if (trip.tags.includes(TAG_ABSENCE)) {
      if (trip.startDay) absences.push(toAbsence(trip, trip.startDay));
      else review.push(trip);
      continue;
    }
    const entirelyForeign =
      trip.countries.length > 0 && foreignCountries(trip.countries).length === trip.countries.length;
    if (trip.startDay && entirelyForeign) {
      absences.push(toAbsence(trip, trip.startDay));
      toTag.push(trip);
    } else {
      review.push(trip);
    }
  }
  return { absences, review, toTag, overlaps: findOverlaps(absences) };
}
