import { AuthError } from "../api/client";
import type { TravStatsApi } from "../api/travstats";
import type { Op } from "./reconcile";

type OpsApi = Pick<TravStatsApi, "createTrip" | "updateTrip" | "assignFlights">;

/** Runs ops in order; stops at the first failure. Safe to re-run: reconcile is idempotent. */
export async function applyOps(api: OpsApi, ops: Op[]): Promise<{ applied: number; error: string | null }> {
  let applied = 0;
  try {
    for (const op of ops) {
      switch (op.kind) {
        case "create": {
          const trip = await api.createTrip({ ...op.fields, tags: op.tags });
          if (op.flightIds.length > 0) await api.assignFlights(trip.id, op.flightIds);
          break;
        }
        case "tag":
          await api.updateTrip(op.tripId, { tags: op.tags });
          break;
        case "attach":
          await api.assignFlights(op.tripId, op.flightIds);
          break;
        case "update":
          await api.updateTrip(op.tripId, op.fields);
          break;
      }
      applied += 1;
    }
    return { applied, error: null };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    return { applied, error: e instanceof Error ? e.message : String(e) };
  }
}
