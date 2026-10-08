import { TAG_ABSENCE, TAG_AUTO, TAG_IGNORED, foreignCountries } from "../domain/absences";
import { countryName } from "../domain/countries";
import type { Day } from "../domain/dates";
import type { TripRecord } from "../domain/types";
import type { Candidate } from "./flightPairing";

export interface TripFields {
  name: string;
  countries: string[];
  startDate: Day;
  endDate: Day | null;
}

export type Op =
  | { kind: "create"; fields: TripFields; tags: string[]; flightIds: string[] }
  | { kind: "tag"; tripId: string; tags: string[] }
  | { kind: "attach"; tripId: string; flightIds: string[] }
  | { kind: "update"; tripId: string; fields: TripFields };

const FAR_FUTURE = "9999-12-31";

export function tripName(countries: string[]): string {
  return countries.length ? countries.map(countryName).join(", ") : "Abroad";
}

function fieldsFor(c: Candidate): TripFields {
  return { name: tripName(c.countries), countries: c.countries, startDate: c.leave, endDate: c.return };
}

function sameFields(trip: TripRecord, f: TripFields): boolean {
  const have = [...foreignCountries(trip.countries)].sort().join(",");
  const want = [...foreignCountries(f.countries)].sort().join(",");
  return trip.startDay === f.startDate && trip.endDay === f.endDate && have === want;
}

function overlaps(trip: TripRecord, c: Candidate): boolean {
  if (!trip.startDay) return false;
  return trip.startDay <= (c.return ?? FAR_FUTURE) && c.leave <= (trip.endDay ?? FAR_FUTURE);
}

const counts = (t: TripRecord) => t.tags.includes(TAG_ABSENCE) && !t.tags.includes(TAG_IGNORED);

/**
 * What to change in TravStats so every flight-implied absence is a counted trip.
 * Pure. Never deletes, never moves a flight between trips, and returns no ops
 * once its previous ops have been applied.
 */
/** The visible trip a candidate's flights belong to: the first non-auto one, else the first visible. */
function ownerOf(c: Candidate, byId: Map<string, TripRecord>): TripRecord | undefined {
  const visible = c.tripIds.map((id) => byId.get(id)).filter((t): t is TripRecord => t !== undefined);
  return visible.find((t) => !t.tags.includes(TAG_AUTO)) ?? visible[0];
}

export function reconcile(candidates: Candidate[], trips: TripRecord[]): Op[] {
  const byId = new Map(trips.map((t) => [t.id, t]));
  const ops: Op[] = [];
  const tagged = new Set<string>();

  const owners = candidates.map((c) => ownerOf(c, byId));
  const claims = new Map<string, number>();
  for (const o of owners) {
    if (o) claims.set(o.id, (claims.get(o.id) ?? 0) + 1);
  }

  candidates.forEach((c, i) => {
    const fields = fieldsFor(c);
    const owner = owners[i];
    if (c.tripIds.length > 0 && !owner) return;

    const target = owner ?? trips.find((t) => counts(t) && !t.tags.includes(TAG_AUTO) && overlaps(t, c));
    if (!target) {
      ops.push({ kind: "create", fields, tags: [TAG_ABSENCE, TAG_AUTO], flightIds: c.flightIds });
      return;
    }
    if (target.tags.includes(TAG_IGNORED)) return;

    if (!target.tags.includes(TAG_ABSENCE) && !tagged.has(target.id)) {
      ops.push({ kind: "tag", tripId: target.id, tags: [...target.tags, TAG_ABSENCE] });
      tagged.add(target.id);
    }
    if (c.looseFlightIds.length > 0) {
      ops.push({ kind: "attach", tripId: target.id, flightIds: c.looseFlightIds });
    }
    if (
      owner !== undefined &&
      owner.tags.includes(TAG_AUTO) &&
      claims.get(owner.id) === 1 &&
      !sameFields(owner, fields)
    ) {
      ops.push({ kind: "update", tripId: owner.id, fields });
    }
  });
  return ops;
}
