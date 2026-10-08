import type { Day } from "./dates";
import type { Path } from "./rules";

export interface Settings {
  greenCardDate: Day;
  path: Path;
  displayName?: string;
}

export type AbsenceSource = "manual" | "auto" | "travstats";

/** One stretch outside the US: left on `leave`, back on `return` (null = not logged yet). */
export interface Absence {
  id: string;
  name: string;
  countries: string[];
  leave: Day;
  return: Day | null;
  source: AbsenceSource;
}

/** A TravStats trip, reduced to what this app reads. */
export interface TripRecord {
  id: string;
  name: string;
  tags: string[];
  countries: string[];
  startDay: Day | null;
  endDay: Day | null;
}

export interface FlightEnd {
  utc: string;
  local: string;
  precision: string;
}

/** A TravStats flight, reduced to what this app reads. */
export interface FlightRecord {
  id: string;
  status: string;
  depCountry: string | null;
  arrCountry: string | null;
  departure: FlightEnd | null;
  arrival: FlightEnd | null;
  tripId: string | null;
}
