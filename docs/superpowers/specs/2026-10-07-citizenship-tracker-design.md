# Citizenship Tracker — design

Date: 2026-10-07 · Status: draft for owner review

A small, mobile-first web app that tracks one person's path to US
naturalization — days physically present, days abroad, the earliest date to
file the N-400 — using TravStats as its only data store. Trips entered in
either app appear in both.

> **Not legal advice.** Every figure is an estimate from the rules in §3. The
> app says so on every screen that shows a date or a count.

## 1. Goals and non-goals

**Goals (v1)**

- Home dashboard and Trips list that reproduce the owner's reference
  screenshots (time as PR, apply date + countdown ring, days in USA vs.
  required, days abroad, physical-presence status, next trip, trips that
  count, days in USA by year).
- Add / edit / delete an absence (country, departure date, return date).
- Absences derived automatically from flights logged in TravStats.
- A minimal Settings screen: green card date, path, display name.
- Read and write go to TravStats; this app stores nothing of its own.

**Non-goals (v1)**

- "What if?" planner (v2; the domain module is built so it can be fed
  hypothetical absences without saving them).
- Continuous-residence *rebuttal* evidence, state-residence (3 months)
  tracking, marital-union checks for the 3-year path.
- Multi-user. One TravStats account; whoever logs in sees their own data.
- Offline mode, push notifications, native app.
- Any change to the TravStats fork. v1 uses its API as published on upstream
  `main`.

## 2. Context and decisions

| Decision | Choice | Why |
|---|---|---|
| Where it lives | New public repo `ohmzi/citizenship-tracker` | Keeps the TravStats fork mergeable with upstream |
| Stack | React + Vite + TypeScript, Vitest | Same as the TravStats frontend |
| Auth | Same-origin reverse proxy: nginx serves the app and proxies `/api/v1` to TravStats; user logs in with TravStats credentials | TravStats cookies are host-only, `SameSite=Strict`, HttpOnly, so they work behind a proxy with no CORS, no token storage, and 2FA intact |
| Where logic runs | In this app (pure TS modules) | Fork stays untouched; trade-off: a flight logged in TravStats becomes a trip there only after this app next loads |
| Absence record | A TravStats `Trip` | `Trip` already has `countries[]`, `startDate`/`endDate`, `status`, `tags[]`, and owns flights |
| Flights → trips | Auto-created, idempotent | Owner's choice |
| Untagged TravStats trips | Non-US dated trips count automatically; trips that include US or name no country go to "Needs review" | Owner's choice |
| Early-filing presence | Presence counted **up to the filing date**, not over the full N years | Conservative; see §3.3 |
| TravStats version | The fork built from upstream `main` (v2.7 line), replacing the pinned 2.6.3 image | Owner's choice; database is empty so the switch is free |

## 3. Counting rules (`domain/`)

All dates are calendar days as `"YYYY-MM-DD"` strings. No module in `domain/`
constructs a `Date` from local components or reads the host time zone;
"today" is passed in as a string computed once at the edge
(`Intl.DateTimeFormat` with the browser's resolved `timeZone`).

### 3.1 Inputs

```ts
type Path = "spouse3" | "standard5";
interface Settings { greenCardDate: string; path: Path; displayName?: string }
interface Absence {
  id: string;               // TravStats trip id
  countries: string[];      // ISO 3166-1 alpha-2, non-US
  leave: string;            // local day departed the US
  return: string | null;    // local day re-entered; null = not logged yet
  planned: boolean;         // leave > today, or derived from scheduled flights
  source: "manual" | "auto" | "travstats";
}
```

### 3.2 Constants per path

| Path | Years N | Required presence | Source |
|---|---|---|---|
| `spouse3` (INA 319(a)) | 3 | 548 days (18 months) | USCIS Policy Manual Vol. 12, Part G |
| `standard5` (INA 316(a)) | 5 | 913 days (30 months) | USCIS Policy Manual Vol. 12, Part D |

### 3.3 Rules

1. **Earliest filing date** `E = addYears(greenCardDate, N) − 90 days`.
   2026-09-01, 3-year → 2029-06-03. `addYears` on Feb 29 lands on Mar 1.
2. **Days abroad for one absence** = `max(0, daysBetween(leave, return) − 1)`.
   The departure day and the return day count as days present in the US.
   Oct 23 → Oct 30 = 6 days abroad.
3. **Open absence** (`return = null`): it is abroad through today. It counts
   `daysBetween(leave, today)` days abroad (the leave day is still present).
   It is shown with a "return not logged" badge.
4. **Overlaps.** Abroad days are a *set* of dates, so two absences covering the
   same dates are never counted twice. Overlapping absences are also listed in
   Needs review.
5. **Presence window.** Presence counted toward filing on day `D` is
   the number of days from `max(greenCardDate, addYears(D, −N))` through `D`
   inclusive, minus the abroad days in that range. The window ends at the
   filing date, not at the N-year anniversary. That is the conservative
   reading of early filing. Verify it against Policy Manual Vol. 12, Part D,
   Ch. 4 before treating a borderline result as final.
6. **Days in USA so far** = presence on `today`, completed absences only.
7. **Days abroad so far** = abroad days with date ≤ today.
8. **Projected apply date** = the first `D ≥ E` where presence on `D` ≥ the
   requirement, counting completed **and planned** absences. If `D > E`, the
   status card turns amber and says how many days late, and why.
9. **Room left** = `presenceWindowLength(E) − required − plannedAbroadDays −
   abroadSoFar`. This is shown as "You could spend up to X abroad and still
   meet your target date". If it is below 0, the card goes amber.
10. **Continuous residence.** A single absence of more than 180 days abroad
    gives an amber warning ("presumed break, rebuttable"). One of 365 or more
    days gives a red warning ("breaks continuous residence").
11. **Days in USA by year.** For each calendar year from `greenCardDate` to
    today: present days / elapsed days in that year since `greenCardDate`.
    Example: 2026 = 37/37.
12. **Trips that count.** Absences that intersect the presence window of the
    projected apply date, each shown with calendar days
    (`daysBetween + 1`) and USCIS days abroad (rule 2).

### 3.4 Output

`computeSummary(settings, absences, today) → Summary`. This is a single
plain object with every number Home displays, plus `warnings[]`. It is pure
and deterministic, so the "What if?" planner in v2 can call it with extra
absences.

## 4. Absences ⇄ TravStats trips (`domain/absences.ts`, `sync/`)

### 4.1 Mapping

A TravStats trip that counts as an absence has these fields:

- `name`: the English country name, or "Canada, France" for more than one
- `countries`: the ISO codes
- `startDate`: the leave day
- `endDate`: the return day, or empty if not logged
- `status`: `planned` / `in_progress` / `completed`, derived from the dates
- `tags`: always `us-absence`, plus `auto` for trips created from flights

### 4.2 Which trips count

| TravStats trip | Treatment |
|---|---|
| Tagged `us-absence` | Counts |
| Tagged `us-absence-ignored` | Never counts; hidden from review |
| Untagged, has `startDate`, `countries` non-empty and without `US` | Counts. It is tagged `us-absence` on the next sync, so the decision is visible in TravStats |
| Untagged, `countries` includes `US` or is empty, or no `startDate` | Needs review. **Count** adds `us-absence`; **Ignore** adds `us-absence-ignored` |

### 4.3 Manual entry

The Add/Edit sheet sends `POST /api/v1/trips` or `PATCH /api/v1/trips/:id`,
and Delete sends `DELETE /api/v1/trips/:id`.

Validation:
- The country must not be US.
- The departure date is required.
- The return date must not be before the departure date.
- A departure date before the green card date is allowed, but it does not
  count toward presence.

### 4.4 Flights → absences (runs on every app load)

**Read.**
- `GET /api/v1/flights`, paged until every flight is read.
- `GET /api/v1/airports/:code` for each distinct airport code. The country
  and zone are cached for the session.
- Flights with status `cancelled` or `duplicated` are ignored.
- Flights with status `scheduled` are *planned*.
- Flights with status `flown` or `historical` are *actual*.

**Local day of a flight end.** The rule depends on the time semantics tag:
- `UTC`: format the instant in the end's frozen `depTimezone`/`arrTimezone`,
  falling back to the airport catalogue zone.
- `LEGACY_FAKE_UTC` and `DATE_ONLY`: the stored value's `YYYY-MM-DD` as-is.
- `UNKNOWN`: same as above, and the resulting absence is marked
  "date uncertain".

**Pairing.**
- Sort the flights by departure.
- An **exit** is a flight from a US airport to a non-US airport. An **entry**
  is a flight from a non-US airport to a US airport.
- Each exit pairs with the next entry. Flights in between contribute their
  non-US airports' countries.
- US→US flights are ignored, and so are foreign→foreign flights with no
  surrounding exit.
- If an exit has no later entry, the result is an open absence.
- If an entry has no earlier unpaired exit, the result is an
  *orphan entry*. It raises the warning card "You arrived on X but no
  departure is logged. Add the trip."

**Reconcile.** This is pure and produces a list of operations, which are then
applied in order. For each candidate absence:
1. If any of its flights already has a `tripId`, tag that trip `us-absence`
   (when it isn't already) and attach the remaining flights to it. A flight is
   never moved from one trip to another.
2. Otherwise, if an existing counting absence overlaps the candidate's dates,
   attach the flights to that absence.
3. Otherwise, create a trip tagged `us-absence`, `auto` and attach the
   flights through `POST /api/v1/trips/:id/flights`.
4. Trips tagged `auto` have their dates and countries rewritten from their
   flights when those change. Trips without `auto` are never rewritten.

Running reconcile twice with no data changes yields zero operations. A test
pins this.

### 4.5 Failure behaviour

- Reconcile errors show a dismissible banner. The dashboard still computes
  from the trips that were read.
- Operations are applied one by one. A failure stops the run, and the next
  load retries, which is safe because the run is idempotent.

## 5. Settings (`api/appSettings.ts`)

- Settings are stored in TravStats `GET`/`PUT /api/v1/app-settings` as
  `prefs.citizenship = { greenCardDate, path, displayName }`.
- A save reads the current `prefs` and writes them back with only the
  `citizenship` key replaced, so the TravStats mobile app's preferences
  survive.
- With no settings saved, Home shows a single "Set your green card date" card
  that links to Settings.

## 6. Screens

- **Login.** Username and password go to `POST /api/v1/auth/login`, followed
  by the TravStats 2FA step when that is enabled. Any 401 elsewhere returns to
  Login.
- **Home**, in screenshot order:
  1. Greeting
  2. Dark "Time as Permanent Resident" banner
  3. "You can apply for Citizenship on" with the countdown ring and the
     countdown in years, months and days
  4. Two tiles: "In USA (N months required)" and "Abroad"
  5. Physical-presence status card (green, amber or red)
  6. Next-trip card
  7. "Trips that count"
  8. "Days in USA by year" bars
  9. Warning cards (orphan entry, review queue, continuous residence)
  10. Footer: "Estimate, not legal advice", with links to the Policy Manual
- **Trips.** The list shows flag, country, dates and USCIS days abroad, plus
  "planned", "auto" and "return not logged" badges. There is a Needs-review
  section and a `+` button that opens the Add/Edit bottom sheet. The
  segmented "Trips / What if?" control is shown with "What if?" disabled as
  "Coming soon".
- **Settings.** Green card date, path radio, display name, a "Signed in as…"
  line, and Log out.
- **Look.** Off-white background, white rounded cards, a dark hero card and a
  dark pill-shaped bottom nav, matching the screenshots. Flags are emoji from
  the ISO code, and country names come from `Intl.DisplayNames`. The ring and
  bars are plain SVG and CSS, with no chart library.

## 7. Repository layout

```
citizenship-tracker/
  src/domain/    dates.ts  rules.ts  presence.ts  absences.ts
  src/sync/      flightLocalDay.ts  flightPairing.ts  reconcile.ts  applyOps.ts
  src/api/       client.ts  auth.ts  trips.ts  flights.ts  airports.ts  appSettings.ts
  src/pages/     LoginPage  HomePage  TripsPage  SettingsPage
  src/components/ HeroCard  ApplyDateCard  ProgressRing  StatTile  StatusCard
                  NextTripCard  TripsThatCount  YearBars  TripRow  TripSheet  BottomNav
  deploy/        Dockerfile  nginx.conf  compose.example.yml
  docs/superpowers/specs/  (this file)
```

Every `domain/` and `sync/` module except `applyOps.ts` is pure (no I/O) and
unit-tested on its own.

## 8. Deployment

**Phase 0, in the TravStats fork:**
- Build an image from fork `main`.
- Point `/home/ohmz/StudioProjects/travstats/docker-compose.yml` at it instead
  of `ghcr.io/abrechen2/travstats:2.6.3`.
- Take a database dump first, as the README asks.

**This app:**
- A multi-stage Docker image: `vite build`, then `nginx:alpine` serving
  `dist/`.
- `location /api/v1/` proxies to `http://travstats-app:80`, passing `Host`
  and `X-Forwarded-*`.
- The container joins the `travstats-network` network.
- It is published on loopback, and cloudflared maps
  `citizenship.ohmzhomelab.ca` to it, behind a Cloudflare Access policy.
- `TRUST_PROXY` on TravStats must also trust this nginx hop, so login rate
  limits stay per-client.

## 9. Testing

- **`domain/`** (Vitest), with the screenshot scenario as a golden test:
  - Green card date 2026-09-01, 3-year path, today 2026-10-07, Canada
    2026-10-23 → 2026-10-30 planned.
  - Expected: E = 2029-06-03; presence window to E = 1007 days; 6 days
    abroad; 37 days in the US; 2026 bar 37/37; projected apply date = E;
    room left = 1007 − 548 − 6 = 453 days. The reference app shows
    "17 mo 31 d" because it uses the full 3 years (§10).
  - Plus: leap day, same-day and overnight trips, overlapping absences, an
    open absence, the 180 and 365 warnings, planned absences pushing the apply
    date, the 5-year path, and a leave date before the green card date.
- **`sync/`:**
  - flightLocalDay, for each time semantics tag, including an LAX departure
    on 31 Dec at 18:00 local.
  - Pairing: out-and-back, multi-city, unpaired exit, orphan entry, domestic
    flights only.
  - Reconcile: flights already in a trip, overlap with a manual trip, `auto`
    trips rewritten, manual trips untouched, and a second run producing zero
    operations.
- **Components:** TripSheet validation; the Settings save keeps other `prefs`
  keys.
- **Manual end-to-end:** a local TravStats (fork `main`, `npm run dev`) with
  seeded flights, run through the same-origin Vite dev proxy.

## 10. Risks

- **Early-filing reading (§3.3 rule 5).** If USCIS counts presence over the
  full N years, the app under-reports the room left by up to 90 days. It errs
  safe.
- **TravStats API drift.** The app depends on the trips, flights, airports,
  app-settings and auth endpoints. The fork is pinned and upgraded
  deliberately, and the API client validates responses with zod and fails
  loudly.
- **Auto-tagging writes to TravStats.** Reconcile only adds tags, attaches
  trip-less flights, and creates or rewrites `auto` trips. It never deletes
  anything and never moves a flight between trips.
