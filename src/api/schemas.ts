import { z } from "zod";
import { isDay } from "../domain/dates";
import type { FlightRecord, Settings, TripRecord } from "../domain/types";

const timeValue = z.object({ utc: z.string(), local: z.string(), precision: z.string() });
const dayValue = z.object({ date: z.string() });

export const apiTripSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  times: z.object({ start: dayValue.nullable(), end: dayValue.nullable() }).optional(),
});

export const apiFlightSchema = z.object({
  id: z.string(),
  status: z.string(),
  depCountry: z.string().nullable().optional(),
  arrCountry: z.string().nullable().optional(),
  tripId: z.string().nullable().optional(),
  times: z.object({ departure: timeValue.nullable(), arrival: timeValue.nullable() }).optional(),
});

export const tripsResponse = z.object({ trips: z.array(apiTripSchema) });
export const tripResponse = z.object({ trip: apiTripSchema });
export const flightsResponse = z.object({ flights: z.array(apiFlightSchema) });
export const meResponse = z.object({
  user: z.object({ username: z.string(), firstName: z.string().nullable().optional() }),
});
export const loginResponse = z
  .object({ requiresTwoFactor: z.boolean().optional(), requiresPasswordChange: z.boolean().optional() })
  .passthrough();
export const appSettingsResponse = z.object({ prefs: z.record(z.unknown()).nullable() });

export const settingsSchema: z.ZodType<Settings> = z.object({
  greenCardDate: z.string().refine(isDay, "greenCardDate must be YYYY-MM-DD"),
  path: z.enum(["spouse3", "standard5"]),
  displayName: z.string().max(60).optional(),
});

const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : null);

export function toTripRecord(t: z.infer<typeof apiTripSchema>): TripRecord {
  return {
    id: t.id,
    name: t.name,
    tags: t.tags,
    countries: t.countries,
    startDay: t.times?.start?.date ?? day(t.startDate),
    endDay: t.times?.end?.date ?? day(t.endDate),
  };
}

export function toFlightRecord(f: z.infer<typeof apiFlightSchema>): FlightRecord {
  return {
    id: f.id,
    status: f.status,
    depCountry: f.depCountry ?? null,
    arrCountry: f.arrCountry ?? null,
    tripId: f.tripId ?? null,
    departure: f.times?.departure ?? null,
    arrival: f.times?.arrival ?? null,
  };
}
