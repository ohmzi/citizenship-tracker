import type { Day } from "../domain/dates";
import { isUsJurisdiction } from "../domain/rules";
import type { FlightRecord } from "../domain/types";

const IGNORED_STATUSES = new Set(["cancelled", "duplicated"]);

/** An absence implied by flights: an exit from the US paired with the next entry. */
export interface Candidate {
  flightIds: string[];
  /** Distinct TravStats trips its flights already belong to, in flight order. */
  tripIds: string[];
  /** Its flights that belong to no trip yet. */
  looseFlightIds: string[];
  countries: string[];
  leave: Day;
  return: Day | null;
  planned: boolean;
}

export type Notice =
  | { kind: "orphan_entry"; flightId: string; day: Day }
  | { kind: "return_assumed"; flightId: string; day: Day }
  | { kind: "date_uncertain"; flightId: string };

interface Leg {
  flight: FlightRecord;
  depUs: boolean;
  arrUs: boolean;
  depCountry: string;
  arrCountry: string;
  departureDay: Day;
  arrivalDay: Day;
}

function toLeg(f: FlightRecord): Leg | null {
  if (IGNORED_STATUSES.has(f.status)) return null;
  if (!f.departure || !f.arrival || !f.depCountry || !f.arrCountry) return null;
  return {
    flight: f,
    depUs: isUsJurisdiction(f.depCountry),
    arrUs: isUsJurisdiction(f.arrCountry),
    depCountry: f.depCountry,
    arrCountry: f.arrCountry,
    // The server already resolved the airport's clock (ADR 0002); the local
    // wall clock's date is the day as the traveller lived it.
    departureDay: f.departure.local.slice(0, 10),
    arrivalDay: f.arrival.local.slice(0, 10),
  };
}

function addLeg(c: Candidate, leg: Leg): void {
  c.flightIds.push(leg.flight.id);
  const tripId = leg.flight.tripId;
  if (tripId === null) c.looseFlightIds.push(leg.flight.id);
  else if (!c.tripIds.includes(tripId)) c.tripIds.push(tripId);
}

function addCountry(c: Candidate, code: string): void {
  if (!isUsJurisdiction(code) && !c.countries.includes(code)) c.countries.push(code);
}

export function pairFlights(flights: FlightRecord[]): { candidates: Candidate[]; notices: Notice[] } {
  const legs = flights
    .map(toLeg)
    .filter((leg): leg is Leg => leg !== null)
    .sort((a, b) => a.flight.departure!.utc.localeCompare(b.flight.departure!.utc));

  const candidates: Candidate[] = [];
  const notices: Notice[] = [];
  let open: Candidate | null = null;

  for (const leg of legs) {
    const { flight } = leg;
    if (flight.departure!.precision === "unknown" || flight.arrival!.precision === "unknown") {
      notices.push({ kind: "date_uncertain", flightId: flight.id });
    }
    const isExit = leg.depUs && !leg.arrUs;
    const isEntry = !leg.depUs && leg.arrUs;

    if (isExit) {
      if (open !== null) {
        // Left again without a logged way back: assume abroad until this exit.
        open.return = leg.departureDay;
        notices.push({ kind: "return_assumed", flightId: flight.id, day: leg.departureDay });
        candidates.push(open);
      }
      open = {
        flightIds: [],
        tripIds: [],
        looseFlightIds: [],
        countries: [],
        leave: leg.departureDay,
        return: null,
        planned: flight.status === "scheduled",
      };
      addLeg(open, leg);
      addCountry(open, leg.arrCountry);
    } else if (isEntry) {
      if (open !== null) {
        addLeg(open, leg);
        addCountry(open, leg.depCountry);
        open.return = leg.arrivalDay;
        candidates.push(open);
        open = null;
      } else {
        notices.push({ kind: "orphan_entry", flightId: flight.id, day: leg.arrivalDay });
      }
    } else if (open !== null && !leg.depUs && !leg.arrUs) {
      addLeg(open, leg);
      addCountry(open, leg.depCountry);
      addCountry(open, leg.arrCountry);
    }
  }
  if (open !== null) candidates.push(open);
  return { candidates, notices };
}
