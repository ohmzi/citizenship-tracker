import type { TravStatsApi, User } from "../api/travstats";
import { TAG_ABSENCE, classifyTrips, type Classification } from "../domain/absences";
import type { Day } from "../domain/dates";
import { computeSummary, type Summary } from "../domain/presence";
import type { Settings, TripRecord } from "../domain/types";
import { applyOps } from "../sync/applyOps";
import { pairFlights, type Notice } from "../sync/flightPairing";
import { dateMismatches, reconcile, type Op } from "../sync/reconcile";

export interface TravelData {
  user: User;
  settings: Settings | null;
  trips: TripRecord[];
  classification: Classification;
  notices: Notice[];
  summary: Summary | null;
  syncError: string | null;
  today: Day;
}

/** Arrivals and assumed returns on or before the green card date say nothing about residence. */
function relevant(notices: Notice[], settings: Settings | null): Notice[] {
  if (!settings) return notices;
  return notices.filter(
    (n) => !((n.kind === "orphan_entry" || n.kind === "return_assumed") && n.day <= settings.greenCardDate)
  );
}

/** Read TravStats, bring its trips in line with its flights, then compute everything Home shows. */
export async function loadTravelData(api: TravStatsApi, today: Day): Promise<TravelData> {
  const [user, settings, flights, initialTrips] = await Promise.all([
    api.me(),
    api.getSettings(),
    api.listFlights(),
    api.listTrips(),
  ]);
  const { candidates, notices } = pairFlights(flights);
  let trips = initialTrips;
  let syncError: string | null = null;

  const flightTripIds = new Set(flights.flatMap((f) => (f.tripId === null ? [] : [f.tripId])));
  const flightOps = reconcile(candidates, trips, flightTripIds);
  if (flightOps.length > 0) {
    syncError = (await applyOps(api, flightOps)).error;
    trips = await api.listTrips();
  }

  const mismatches: Notice[] = dateMismatches(candidates, trips, flightTripIds).map((m) => ({
    kind: "dates_mismatch",
    ...m,
  }));

  const classification = classifyTrips(trips);
  const tagOps: Op[] = classification.toTag.map((t) => ({
    kind: "tag",
    tripId: t.id,
    tags: [...t.tags, TAG_ABSENCE],
  }));
  if (tagOps.length > 0) {
    syncError = syncError ?? (await applyOps(api, tagOps)).error;
  }

  const summary = settings ? computeSummary(settings, classification.absences, today) : null;
  return { user, settings, trips, classification, notices: relevant([...notices, ...mismatches], settings), summary, syncError, today };
}
