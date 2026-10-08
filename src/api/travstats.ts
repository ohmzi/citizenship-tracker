import { z } from "zod";
import type { Day } from "../domain/dates";
import type { FlightRecord, Settings, TripRecord } from "../domain/types";
import { request } from "./client";
import {
  appSettingsResponse,
  flightsResponse,
  loginResponse,
  meResponse,
  settingsSchema,
  toFlightRecord,
  toTripRecord,
  tripResponse,
  tripsResponse,
} from "./schemas";

export interface User {
  username: string;
  firstName: string | null;
}

export interface TripInput {
  name: string;
  countries: string[];
  startDate: Day;
  endDate: Day | null;
  tags: string[];
}

export type LoginResult = "ok" | "two_factor" | "password_change";

export interface TravStatsApi {
  login(username: string, password: string): Promise<LoginResult>;
  verifyTwoFactor(code: string): Promise<void>;
  logout(): Promise<void>;
  me(): Promise<User>;
  listTrips(): Promise<TripRecord[]>;
  listFlights(): Promise<FlightRecord[]>;
  createTrip(input: TripInput): Promise<TripRecord>;
  updateTrip(id: string, patch: Partial<TripInput>): Promise<TripRecord>;
  deleteTrip(id: string): Promise<void>;
  assignFlights(tripId: string, flightIds: string[]): Promise<void>;
  getSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<void>;
}

const anything = z.unknown();
const tripPath = (id: string) => `/trips/${encodeURIComponent(id)}`;

export const travstats: TravStatsApi = {
  async login(username, password) {
    const r = await request("/auth/login", loginResponse, { method: "POST", json: { username, password } });
    if (r.requiresTwoFactor) return "two_factor";
    if (r.requiresPasswordChange) return "password_change";
    return "ok";
  },
  async verifyTwoFactor(code) {
    await request("/auth/2fa/verify", anything, { method: "POST", json: { code } });
  },
  async logout() {
    await request("/auth/logout", anything, { method: "POST" });
  },
  async me() {
    const r = await request("/auth/me", meResponse);
    return { username: r.user.username, firstName: r.user.firstName ?? null };
  },
  async listTrips() {
    return (await request("/trips", tripsResponse)).trips.map(toTripRecord);
  },
  async listFlights() {
    return (await request("/flights?all=true", flightsResponse)).flights.map(toFlightRecord);
  },
  async createTrip(input) {
    const { endDate, ...rest } = input;
    const json = endDate === null ? rest : input;
    return toTripRecord((await request("/trips", tripResponse, { method: "POST", json })).trip);
  },
  async updateTrip(id, patch) {
    return toTripRecord((await request(tripPath(id), tripResponse, { method: "PATCH", json: patch })).trip);
  },
  async deleteTrip(id) {
    await request(tripPath(id), anything, { method: "DELETE" });
  },
  async assignFlights(tripId, flightIds) {
    await request(`${tripPath(tripId)}/flights`, anything, {
      method: "POST",
      json: { flightIds, action: "add" },
    });
  },
  async getSettings() {
    const r = await request("/app-settings", appSettingsResponse);
    const parsed = settingsSchema.safeParse(r.prefs?.citizenship);
    return parsed.success ? parsed.data : null;
  },
  async saveSettings(settings) {
    // Read-modify-write: the blob is shared with the TravStats mobile app.
    const current = await request("/app-settings", appSettingsResponse);
    await request("/app-settings", anything, {
      method: "PUT",
      json: { prefs: { ...(current.prefs ?? {}), citizenship: settings } },
    });
  },
};
