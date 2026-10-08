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
const isAuto = (t: TripRecord) => t.tags.includes(TAG_AUTO);

/** The visible trip a candidate's flights belong to: the first non-auto one, else the first visible. */
function ownerOf(c: Candidate, byId: Map<string, TripRecord>): TripRecord | undefined {
  const visible = c.tripIds.map((id) => byId.get(id)).filter((t): t is TripRecord => t !== undefined);
  return visible.find((t) => !isAuto(t)) ?? visible[0];
}

/**
 * Where a candidate's flights belong:
 * - "skip": its flights sit in trips this app cannot see, so leave them alone;
 * - "none": no trip fits, so one must be created;
 * - "trip": its owner, else an overlapping counted manual trip, else an
 *   overlapping counted auto trip no flight points to (an orphan left by an
 *   interrupted earlier sync).
 * reconcile and dateMismatches both resolve through here so they never drift.
 */
export type Target = { kind: "skip" } | { kind: "none" } | { kind: "trip"; trip: TripRecord };

export function targetFor(
  c: Candidate,
  trips: TripRecord[],
  byId: Map<string, TripRecord>,
  flightTripIds: ReadonlySet<string>
): Target {
  const owner = ownerOf(c, byId);
  if (owner) return { kind: "trip", trip: owner };
  if (c.tripIds.length > 0) return { kind: "skip" };
  const manual = trips.find((t) => counts(t) && !isAuto(t) && overlaps(t, c));
  if (manual) return { kind: "trip", trip: manual };
  const orphan = trips.find((t) => counts(t) && isAuto(t) && !flightTripIds.has(t.id) && overlaps(t, c));
  return orphan ? { kind: "trip", trip: orphan } : { kind: "none" };
}

/**
 * What to change in TravStats so every flight-implied absence is a counted trip.
 * Pure. Never deletes, never moves a flight between trips, and returns no ops
 * once its previous ops have been applied. `flightTripIds` is every non-null
 * tripId on any flight; an auto trip outside it has no flights and may be adopted.
 */
export function reconcile(candidates: Candidate[], trips: TripRecord[], flightTripIds: ReadonlySet<string>): Op[] {
  const byId = new Map(trips.map((t) => [t.id, t]));
  const ops: Op[] = [];
  const tagged = new Set<string>();

  const targets = candidates.map((c) => targetFor(c, trips, byId, flightTripIds));
  const claims = new Map<string, number>();
  for (const t of targets) {
    if (t.kind === "trip") claims.set(t.trip.id, (claims.get(t.trip.id) ?? 0) + 1);
  }

  candidates.forEach((c, i) => {
    const fields = fieldsFor(c);
    const resolved = targets[i]!;
    if (resolved.kind === "skip") return;
    if (resolved.kind === "none") {
      ops.push({ kind: "create", fields, tags: [TAG_ABSENCE, TAG_AUTO], flightIds: c.flightIds });
      return;
    }
    const target = resolved.trip;
    if (target.tags.includes(TAG_IGNORED)) return;

    if (!target.tags.includes(TAG_ABSENCE) && !tagged.has(target.id)) {
      ops.push({ kind: "tag", tripId: target.id, tags: [...target.tags, TAG_ABSENCE] });
      tagged.add(target.id);
    }
    if (c.looseFlightIds.length > 0) {
      ops.push({ kind: "attach", tripId: target.id, flightIds: c.looseFlightIds });
    }
    // Only an auto trip is rewritten, and only when this candidate alone claims it.
    if (isAuto(target) && claims.get(target.id) === 1 && !sameFields(target, fields)) {
      ops.push({ kind: "update", tripId: target.id, fields });
    }
  });
  return ops;
}

export interface DateMismatch {
  tripId: string;
  tripName: string;
  tripStart: Day;
  tripEnd: Day | null;
  flightLeave: Day;
  flightReturn: Day | null;
}

/**
 * Candidates whose flights run outside the manual trip they resolve to.
 * reconcile never rewrites a manual trip, so the user is told instead.
 * Pure; never emits ops. Auto trips are left out (sync rewrites them), and so
 * are ignored trips (the user chose not to count them) and undated ones.
 */
export function dateMismatches(
  candidates: Candidate[],
  trips: TripRecord[],
  flightTripIds: ReadonlySet<string>
): DateMismatch[] {
  const byId = new Map(trips.map((t) => [t.id, t]));
  const out: DateMismatch[] = [];
  for (const c of candidates) {
    const resolved = targetFor(c, trips, byId, flightTripIds);
    if (resolved.kind !== "trip") continue;
    const t = resolved.trip;
    if (isAuto(t) || t.tags.includes(TAG_IGNORED) || !t.startDay) continue;
    if (c.leave < t.startDay || (c.return ?? FAR_FUTURE) > (t.endDay ?? FAR_FUTURE)) {
      out.push({
        tripId: t.id,
        tripName: t.name,
        tripStart: t.startDay,
        tripEnd: t.endDay,
        flightLeave: c.leave,
        flightReturn: c.return,
      });
    }
  }
  return out;
}
