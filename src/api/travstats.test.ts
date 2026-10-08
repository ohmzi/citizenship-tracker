import { ApiError, AuthError } from "./client";
import { travstats } from "./travstats";

type Reply = { status?: number; body?: unknown; text?: string };
let calls: Array<{ url: string; method: string; body: unknown }> = [];

function serve(...replies: Reply[]) {
  calls = [];
  const queue = [...replies];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
    const r = queue.shift() ?? {};
    const text = r.text ?? (r.body === undefined ? "" : JSON.stringify(r.body));
    return new Response(text || null, { status: r.status ?? 200 });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("TravStats client", () => {
  it("turns a 401 into AuthError", async () => {
    serve({ status: 401, body: { error: "Unauthorized" } });
    await expect(travstats.me()).rejects.toBeInstanceOf(AuthError);
  });

  it("turns an HTML error page into ApiError instead of crashing", async () => {
    serve({ status: 502, text: "<html>Bad Gateway</html>" });
    const error = await travstats.listTrips().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
  });

  it("surfaces the server's error message", async () => {
    serve({ status: 404, body: { error: "Trip not found" } });
    await expect(travstats.deleteTrip("x")).rejects.toThrow("Trip not found");
  });

  it("maps trips, preferring the local days in times", async () => {
    serve({
      body: {
        trips: [
          {
            id: "t1",
            name: "Canada",
            tags: ["us-absence"],
            countries: ["US", "CA"],
            startDate: "2026-10-23T00:00:00.000Z",
            endDate: null,
            times: { start: { date: "2026-10-23", zone: null, precision: "day" }, end: null },
          },
        ],
      },
    });
    expect(await travstats.listTrips()).toEqual([
      { id: "t1", name: "Canada", tags: ["us-absence"], countries: ["US", "CA"], startDay: "2026-10-23", endDay: null },
    ]);
    expect(calls[0]!.url).toBe("/api/v1/trips");
  });

  it("asks for every flight and maps its ends", async () => {
    serve({
      body: {
        flights: [
          {
            id: "f1",
            status: "flown",
            depCountry: "US",
            arrCountry: "CA",
            tripId: null,
            times: {
              departure: { utc: "2026-10-23T12:00:00.000Z", local: "2026-10-23T08:00", precision: "minute" },
              arrival: { utc: "2026-10-23T14:00:00.000Z", local: "2026-10-23T10:00", precision: "minute" },
            },
          },
        ],
      },
    });
    const [f] = await travstats.listFlights();
    expect(calls[0]!.url).toBe("/api/v1/flights?all=true");
    expect(f).toMatchObject({ id: "f1", depCountry: "US", departure: { local: "2026-10-23T08:00" } });
  });

  it("omits a missing return date when creating a trip", async () => {
    serve({ status: 201, body: { trip: { id: "n1", name: "Canada", tags: [], countries: ["CA"] } } });
    await travstats.createTrip({ name: "Canada", countries: ["CA"], startDate: "2026-10-23", endDate: null, tags: ["us-absence"] });
    expect(calls[0]).toEqual({
      url: "/api/v1/trips",
      method: "POST",
      body: { name: "Canada", countries: ["CA"], startDate: "2026-10-23", tags: ["us-absence"] },
    });
  });

  it("keeps other app preferences when saving settings", async () => {
    serve({ body: { prefs: { units: "metric" } } }, { body: { prefs: {} } });
    await travstats.saveSettings({ greenCardDate: "2026-09-01", path: "spouse3" });
    expect(calls[1]).toEqual({
      url: "/api/v1/app-settings",
      method: "PUT",
      body: { prefs: { units: "metric", citizenship: { greenCardDate: "2026-09-01", path: "spouse3" } } },
    });
  });

  it("reads invalid or missing settings as null", async () => {
    serve({ body: { prefs: { citizenship: { greenCardDate: "soon", path: "spouse3" } } } });
    expect(await travstats.getSettings()).toBeNull();
    serve({ body: { prefs: null } });
    expect(await travstats.getSettings()).toBeNull();
  });

  it("reports a 2FA challenge from login", async () => {
    serve({ body: { requiresTwoFactor: true } });
    expect(await travstats.login("me", "pw")).toBe("two_factor");
  });
});
