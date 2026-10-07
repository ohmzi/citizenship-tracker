# Citizenship Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-first web app that tracks the owner's US naturalization timeline (days in the US, days abroad, earliest N-400 date), storing every absence as a TravStats trip so the two apps stay in sync.

**Architecture:** A static React app. In production nginx serves it and proxies `/api/v1` to TravStats, so the TravStats login cookie works and there is no CORS. All counting and flight-to-trip logic lives in pure TypeScript modules (`src/domain`, `src/sync`) with the I/O kept at the edge (`src/api`, `src/state`). TravStats itself is not modified.

**Tech Stack:** React 18.3, React Router 6, Vite 5, TypeScript 5.6, zod 3, Vitest 2 + Testing Library + jsdom, nginx 1.27 (alpine), Node 22.

**Spec:** `docs/superpowers/specs/2026-10-07-citizenship-tracker-design.md`

## Global Constraints

- Every calendar date is a `"YYYY-MM-DD"` string (`Day`). `src/domain` and `src/sync` never build a `Date` from local parts and never read the host time zone. The only `Date` use is UTC arithmetic inside `src/domain/dates.ts`, plus `Intl.DateTimeFormat` with an explicit `timeZone`.
- "The United States" means the codes `US`, `PR`, `GU`, `VI`, `MP`.
- Paths: `spouse3` = 3 years and 548 required days (18 months). `standard5` = 5 years and 913 required days (30 months).
- Earliest filing date = green card date + N years − 90 days.
- The departure day and the return day count as days present in the US.
- Presence is counted up to the filing date, not over the full N years.
- Residence warnings: an absence of more than 180 days abroad is a presumed break. One of 365 days or more breaks continuous residence.
- TravStats tags: `us-absence`, `us-absence-ignored`, `auto`. Nothing is ever deleted by sync, and a flight is never moved between trips.
- Every screen that shows a count or a date carries "Estimate, not legal advice".
- The app stores nothing itself. Settings live in TravStats `/api/v1/app-settings` under `prefs.citizenship`, and other `prefs` keys are kept.
- Repo: `github.com/ohmzi/citizenship-tracker`, public. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A trip to Puerto Rico or Guam.** It must never become an absence, whether from flights or from the Add sheet. Pinned in Task 5 (pairing) and Task 12 (form validation).
2. **Green card date set in the future.** All counts are 0, there is no crash, and the countdown runs from today to the filing date. Pinned in Task 3.
3. **Deleting a trip that came from flights.** It must not reappear on the next load. Pinned in Task 6 (an ignored owner trip yields no ops) and Task 12 (the sheet's "Don't count" action).
4. **The same absence entered by hand and also present as flights.** It must count once. Pinned in Task 6 (flights attach to the overlapping manual trip) and Task 3 (overlapping absences count as a union).
5. **TravStats down or returning an HTML error page (502).** The app shows an error screen with Retry and does not crash. Pinned in Task 7 (a non-JSON body becomes an `ApiError`).

## File map

```
package.json  tsconfig.json  vite.config.ts  index.html  .gitignore  README.md
src/main.tsx                      React entry
src/App.tsx                       routes + auth gate + error screen
src/styles.css                    design tokens and every class used below
src/domain/dates.ts               Day arithmetic (UTC-only), diffYMD, todayIn
src/domain/rules.ts               path constants, thresholds, US jurisdictions
src/domain/types.ts               Settings, Absence, TripRecord, FlightRecord
src/domain/presence.ts            computeSummary — every number on Home
src/domain/countries.ts           ISO list, countryName, flagEmoji, picker list
src/domain/absences.ts            TravStats trips → absences / review / toTag
src/sync/flightPairing.ts         flights → candidate absences + notices
src/sync/reconcile.ts             candidates + trips → ops (pure, idempotent)
src/sync/applyOps.ts              executes ops against the API
src/api/client.ts                 fetch wrapper, AuthError, ApiError
src/api/schemas.ts                zod schemas + DTO → record mappers
src/api/travstats.ts              TravStatsApi interface + implementation
src/state/loadTravelData.ts       load → sync → classify → summarize
src/state/DataContext.tsx         React context, refresh, auth state
src/ui/format.ts                  display formatting
src/components/*.tsx              cards, nav, sheet (listed per task)
src/pages/*.tsx                   Login, Home, Trips, Settings
deploy/Dockerfile  deploy/nginx.conf  deploy/compose.yml
```

---

### Task 1: Scaffold the repo and publish it

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `README.md`, `src/main.tsx`, `src/App.tsx`, `src/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` (Vitest, jsdom, globals), `npm run build`, `npm run dev` on port 5180 proxying `/api/v1` to `$TRAVSTATS_URL` (default `http://127.0.0.1:8610`).

- [ ] **Step 1: Write the project files**

`package.json`:
```json
{
  "name": "citizenship-tracker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest --run"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.28.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@testing-library/dom": "10.4.0",
    "@testing-library/react": "16.1.0",
    "@types/node": "22.9.0",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.4",
    "jsdom": "25.0.1",
    "typescript": "5.6.3",
    "vite": "5.4.11",
    "vitest": "2.1.8"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Dev only: the browser talks to Vite, Vite forwards /api/v1 to TravStats, so
// the TravStats login cookie is first-party exactly as it is behind nginx.
const travstats = process.env.TRAVSTATS_URL ?? "http://127.0.0.1:8610";

export default defineConfig({
  plugins: [react()],
  server: { port: 5180, proxy: { "/api/v1": { target: travstats } } },
  test: { environment: "jsdom", globals: true },
});
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#f4f3ee" />
    <title>Citizenship Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
*.local
.env
```

`README.md`:
```markdown
# Citizenship Tracker

Tracks a US naturalization timeline (physical presence, days abroad, earliest
N-400 filing date) on top of a [TravStats](https://github.com/ohmzi/TravStats)
instance. Every absence is a TravStats trip tagged `us-absence`, so trips
entered in either app appear in both. Estimates only — not legal advice.

Design: `docs/superpowers/specs/2026-10-07-citizenship-tracker-design.md`.

## Develop

    npm install
    TRAVSTATS_URL=http://127.0.0.1:8610 npm run dev   # http://localhost:5180
    npm test
```

`src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`src/App.tsx` (replaced in Task 9):
```tsx
export function App() {
  return <p>Citizenship Tracker</p>;
}
```

`src/smoke.test.ts`:
```ts
describe("toolchain", () => {
  it("runs tests in jsdom", () => {
    expect(typeof document.createElement).toBe("function");
  });
});
```

- [ ] **Step 2: Install and verify**

Run: `cd /home/ohmz/StudioProjects/citizenship-tracker && npm install && npm test && npm run build`
Expected: 1 test passes, and `dist/index.html` exists.

- [ ] **Step 3: Commit and publish**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh repo create ohmzi/citizenship-tracker --public --source . --push --description "US naturalization timeline on top of TravStats"
```
Expected: the repo exists at github.com/ohmzi/citizenship-tracker, with `main` pushed (it carries the spec and plan commits too).

---

### Task 2: Day arithmetic (`domain/dates.ts`)

**Files:**
- Create: `src/domain/dates.ts`
- Test: `src/domain/dates.test.ts`

**Interfaces:**
- Produces: `type Day = string`; `isDay(s): boolean`; `addDays(d, n): Day`; `daysBetween(from, to): number` (to − from); `addYears(d, n): Day` (Feb 29 → Mar 1 in non-leap years); `maxDay(a, b)`; `minDay(a, b)`; `yearOf(d): number`; `diffYMD(from, to): { years; months; days }`; `todayIn(timeZone, now: Date): Day`.

- [ ] **Step 1: Write the failing test** — `src/domain/dates.test.ts`

```ts
import { addDays, addYears, daysBetween, diffYMD, isDay, maxDay, minDay, todayIn, yearOf } from "./dates";

describe("dates", () => {
  it("validates calendar days", () => {
    expect(isDay("2026-09-01")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-9-1")).toBe(false);
    expect(isDay("")).toBe(false);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2029-09-01", -90)).toBe("2029-06-03");
  });

  it("counts days between two days", () => {
    expect(daysBetween("2026-09-01", "2026-10-07")).toBe(36);
    expect(daysBetween("2026-10-07", "2026-09-01")).toBe(-36);
  });

  it("adds years and moves Feb 29 to Mar 1 in a non-leap year", () => {
    expect(addYears("2026-09-01", 3)).toBe("2029-09-01");
    expect(addYears("2028-02-29", 3)).toBe("2031-03-01");
    expect(addYears("2028-02-29", -4)).toBe("2024-02-29");
  });

  it("diffs in calendar years, months and days", () => {
    expect(diffYMD("2026-10-07", "2029-06-03")).toEqual({ years: 2, months: 7, days: 27 });
    expect(diffYMD("2026-09-01", "2026-10-08")).toEqual({ years: 0, months: 1, days: 7 });
    expect(diffYMD("2027-01-31", "2027-03-01")).toEqual({ years: 0, months: 1, days: 1 });
    expect(diffYMD("2027-03-01", "2027-01-31")).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("reads today in an explicit zone", () => {
    const now = new Date("2026-10-08T02:30:00Z");
    expect(todayIn("America/New_York", now)).toBe("2026-10-07");
    expect(todayIn("Europe/Berlin", now)).toBe("2026-10-08");
  });

  it("orders and reads days", () => {
    expect(maxDay("2026-01-02", "2025-12-31")).toBe("2026-01-02");
    expect(minDay("2026-01-02", "2025-12-31")).toBe("2025-12-31");
    expect(yearOf("2026-10-07")).toBe(2026);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/domain/dates.test.ts`
Expected: FAIL — `Failed to resolve import "./dates"`.

- [ ] **Step 3: Implement** — `src/domain/dates.ts`

```ts
/**
 * Calendar days as "YYYY-MM-DD" strings. All arithmetic is UTC so the host's
 * time zone can never shift a day; a Day never becomes a local Date.
 */
export type Day = string;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface YMD {
  years: number;
  months: number;
  days: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

function parts(day: Day): [number, number, number] {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Not a YYYY-MM-DD day: ${day}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const format = (y: number, m: number, d: number): Day => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

export function isDay(value: string): boolean {
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function toEpochDay(day: Day): number {
  const [y, m, d] = parts(day);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromEpochDay(n: number): Day {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(day: Day, n: number): Day {
  return fromEpochDay(toEpochDay(day) + n);
}

/** `to − from` in days; negative when `to` is earlier. */
export function daysBetween(from: Day, to: Day): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** Same month and day N years on; Feb 29 lands on Mar 1 in a non-leap year. */
export function addYears(day: Day, n: number): Day {
  const [y, m, d] = parts(day);
  const year = y + n;
  if (m === 2 && d === 29 && !isLeapYear(year)) return format(year, 3, 1);
  return format(year, m, d);
}

function addMonthsClamped(day: Day, n: number): Day {
  const [y, m, d] = parts(day);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return format(year, month, Math.min(d, daysInMonth(year, month)));
}

export const maxDay = (a: Day, b: Day): Day => (a > b ? a : b);
export const minDay = (a: Day, b: Day): Day => (a < b ? a : b);
export const yearOf = (day: Day): number => parts(day)[0];

/** Whole calendar years, months and days from `from` to `to` (zeros if reversed). */
export function diffYMD(from: Day, to: Day): YMD {
  if (to <= from) return { years: 0, months: 0, days: 0 };
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  let total = (ty - fy) * 12 + (tm - fm);
  if (addMonthsClamped(from, total) > to) total -= 1;
  const days = daysBetween(addMonthsClamped(from, total), to);
  return { years: Math.floor(total / 12), months: total % 12, days };
}

/** Today's calendar day in an explicit IANA zone. */
export function todayIn(timeZone: string, now: Date): Day {
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => fields.find((f) => f.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest --run src/domain/dates.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/dates.ts src/domain/dates.test.ts
git commit -m "feat(domain): UTC-only calendar day arithmetic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Counting rules (`rules.ts`, `types.ts`, `presence.ts`)

**Files:**
- Create: `src/domain/rules.ts`, `src/domain/types.ts`, `src/domain/presence.ts`
- Test: `src/domain/presence.test.ts`

**Interfaces:**
- Consumes: everything in `dates.ts` (Task 2).
- Produces:
  - `type Path = "spouse3" | "standard5"`; `PATH_RULES: Record<Path, { years; requiredDays; requiredMonths; label }>`; `EARLY_FILING_DAYS = 90`; `PRESUMED_BREAK_DAYS = 180`; `BREAK_DAYS = 365`; `isUsJurisdiction(code): boolean`.
  - `Settings { greenCardDate: Day; path: Path; displayName?: string }`.
  - `Absence { id; name; countries: string[]; leave: Day; return: Day | null; source: "manual" | "auto" | "travstats" }`.
  - `TripRecord { id; name; tags: string[]; countries: string[]; startDay: Day | null; endDay: Day | null }`.
  - `FlightEnd { utc: string; local: string; precision: string }`.
  - `FlightRecord { id; status; depCountry: string | null; arrCountry: string | null; departure: FlightEnd | null; arrival: FlightEnd | null; tripId: string | null }`.
  - `abroadDays(a: Absence, today: Day): number`.
  - `computeSummary(settings, absences, today): Summary`, where `Summary` and `Warning` are as defined in the code below.

- [ ] **Step 1: Write the failing test** — `src/domain/presence.test.ts`

```ts
import { abroadDays, computeSummary } from "./presence";
import type { Absence, Settings } from "./types";

const spouse: Settings = { greenCardDate: "2026-09-01", path: "spouse3" };
const trip = (id: string, leave: string, ret: string | null): Absence => ({
  id,
  name: "Canada",
  countries: ["CA"],
  leave,
  return: ret,
  source: "manual",
});

describe("abroadDays", () => {
  it("counts the departure and return days as present", () => {
    expect(abroadDays(trip("a", "2026-10-23", "2026-10-30"), "2026-10-07")).toBe(6);
    expect(abroadDays(trip("a", "2026-10-10", "2026-10-10"), "2026-10-07")).toBe(0);
    expect(abroadDays(trip("a", "2026-10-10", "2026-10-11"), "2026-10-07")).toBe(0);
    expect(abroadDays(trip("a", "2026-10-10", "2026-10-12"), "2026-10-07")).toBe(1);
  });
  it("counts an open absence through today", () => {
    expect(abroadDays(trip("a", "2026-10-01", null), "2026-10-07")).toBe(6);
  });
});

describe("computeSummary", () => {
  it("reproduces the reference screenshots", () => {
    const s = computeSummary(spouse, [trip("t1", "2026-10-23", "2026-10-30")], "2026-10-07");
    expect(s.earliestFilingDate).toBe("2029-06-03");
    expect(s.projectedApplyDate).toBe("2029-06-03");
    expect(s.requiredDays).toBe(548);
    expect(s.requiredMonths).toBe(18);
    expect(s.daysAsPermanentResident).toBe(37);
    expect(s.daysInUsSoFar).toBe(37);
    expect(s.daysAbroadSoFar).toBe(0);
    expect(s.plannedAbroadDays).toBe(6);
    expect(s.roomLeftDays).toBe(453);
    expect(s.countdownDays).toBe(970);
    expect(s.yearBars).toEqual([{ year: 2026, present: 37, elapsed: 37 }]);
    expect(s.tripsThatCount).toHaveLength(1);
    expect(s.tripsThatCount[0]).toMatchObject({ calendarDays: 8, abroadDays: 6 });
    expect(s.nextTrip).toMatchObject({ daysUntil: 16, abroadDays: 6 });
    expect(s.warnings).toEqual([]);
    expect(s.status).toBe("on_track");
  });

  it("counts overlapping absences once", () => {
    const s = computeSummary(
      spouse,
      [trip("a", "2026-10-01", "2026-10-10"), trip("b", "2026-10-05", "2026-10-15")],
      "2026-10-31"
    );
    expect(s.daysAbroadSoFar).toBe(13);
    expect(s.daysInUsSoFar).toBe(61 - 13);
  });

  it("ignores abroad days before the green card date", () => {
    const s = computeSummary(spouse, [trip("a", "2026-08-20", "2026-09-10")], "2026-09-30");
    expect(s.daysAsPermanentResident).toBe(30);
    expect(s.daysAbroadSoFar).toBe(9);
    expect(s.daysInUsSoFar).toBe(21);
  });

  it("warns when a return is not logged", () => {
    const s = computeSummary(spouse, [trip("a", "2026-10-01", null)], "2026-10-07");
    expect(s.daysInUsSoFar).toBe(31);
    expect(s.warnings).toContainEqual({ kind: "return_not_logged", absenceId: "a" });
  });

  it("flags a presumed break over 180 days abroad", () => {
    const s = computeSummary(spouse, [trip("a", "2027-01-01", "2027-07-15")], "2026-10-07");
    expect(s.warnings).toContainEqual({ kind: "presumed_break", absenceId: "a", abroadDays: 194 });
    expect(s.status).toBe("at_risk");
  });

  it("flags a broken residence at 365 days abroad", () => {
    const s = computeSummary(spouse, [trip("a", "2027-01-01", "2028-01-05")], "2026-10-07");
    expect(s.warnings).toContainEqual({ kind: "breaks_residence", absenceId: "a", abroadDays: 368 });
  });

  it("pushes the apply date when planned travel leaves too little presence", () => {
    const s = computeSummary(spouse, [trip("a", "2027-01-01", "2028-06-01")], "2026-10-07");
    expect(s.projectedApplyDate).toBe("2029-07-30");
    expect(s.roomLeftDays).toBe(-57);
    expect(s.status).toBe("behind");
  });

  it("supports the 5-year path", () => {
    const s = computeSummary({ greenCardDate: "2026-09-01", path: "standard5" }, [], "2026-10-07");
    expect(s.earliestFilingDate).toBe("2031-06-03");
    expect(s.requiredDays).toBe(913);
  });

  it("handles a Feb 29 green card date", () => {
    const s = computeSummary({ greenCardDate: "2028-02-29", path: "spouse3" }, [], "2028-03-01");
    expect(s.earliestFilingDate).toBe("2030-12-01");
  });

  it("returns zeros, not errors, before the green card date", () => {
    const s = computeSummary({ greenCardDate: "2026-12-01", path: "spouse3" }, [], "2026-10-07");
    expect(s.daysAsPermanentResident).toBe(0);
    expect(s.daysInUsSoFar).toBe(0);
    expect(s.daysAbroadSoFar).toBe(0);
    expect(s.yearBars).toEqual([]);
    expect(s.earliestFilingDate).toBe("2029-09-02");
    expect(s.countdownDays).toBe(1061);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/domain/presence.test.ts`
Expected: FAIL — `Failed to resolve import "./presence"`.

- [ ] **Step 3: Implement**

`src/domain/rules.ts`:
```ts
export type Path = "spouse3" | "standard5";

export interface PathRule {
  years: number;
  requiredDays: number;
  requiredMonths: number;
  label: string;
}

/** USCIS Policy Manual Vol. 12 — Part G (spouses, INA 319(a)) and Part D (INA 316(a)). */
export const PATH_RULES: Record<Path, PathRule> = {
  spouse3: { years: 3, requiredDays: 548, requiredMonths: 18, label: "3-year · spouse of a US citizen" },
  standard5: { years: 5, requiredDays: 913, requiredMonths: 30, label: "5-year · standard" },
};

export const EARLY_FILING_DAYS = 90;
/** An absence of MORE than this many days abroad raises a rebuttable presumption of a break. */
export const PRESUMED_BREAK_DAYS = 180;
/** An absence of this many days abroad or more breaks continuous residence. */
export const BREAK_DAYS = 365;

/** INA 101(a)(38) plus the CNMI: time here is never an absence. */
export const US_JURISDICTIONS: ReadonlySet<string> = new Set(["US", "PR", "GU", "VI", "MP"]);
export const isUsJurisdiction = (code: string): boolean => US_JURISDICTIONS.has(code);
```

`src/domain/types.ts`:
```ts
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
```

`src/domain/presence.ts`:
```ts
import { addDays, addYears, daysBetween, maxDay, minDay, yearOf, type Day } from "./dates";
import { BREAK_DAYS, EARLY_FILING_DAYS, PATH_RULES, PRESUMED_BREAK_DAYS } from "./rules";
import type { Absence, Settings } from "./types";

export type Warning =
  | { kind: "presumed_break"; absenceId: string; abroadDays: number }
  | { kind: "breaks_residence"; absenceId: string; abroadDays: number }
  | { kind: "return_not_logged"; absenceId: string };

export interface CountedTrip {
  absence: Absence;
  calendarDays: number;
  abroadDays: number;
}

export interface NextTrip extends CountedTrip {
  daysUntil: number;
}

export interface YearBar {
  year: number;
  present: number;
  elapsed: number;
}

export type PresenceStatus = "on_track" | "at_risk" | "behind";

export interface Summary {
  greenCardDate: Day;
  earliestFilingDate: Day;
  /** First day presence meets the requirement, or null if not within ~10 years. */
  projectedApplyDate: Day | null;
  requiredDays: number;
  requiredMonths: number;
  daysAsPermanentResident: number;
  daysInUsSoFar: number;
  daysAbroadSoFar: number;
  plannedAbroadDays: number;
  /** Days that could still be spent abroad without moving the earliest filing date. */
  roomLeftDays: number;
  countdownDays: number | null;
  /** daysInUsSoFar / requiredDays, capped at 1. */
  progress: number;
  yearBars: YearBar[];
  tripsThatCount: CountedTrip[];
  nextTrip: NextTrip | null;
  warnings: Warning[];
  status: PresenceStatus;
}

const HORIZON_DAYS = 3650;

/** The days spent outside the US: strictly after leaving, strictly before returning. */
export function abroadRange(a: Absence, today: Day): { from: Day; to: Day } | null {
  const from = addDays(a.leave, 1);
  const to = a.return === null ? today : addDays(a.return, -1);
  return from <= to ? { from, to } : null;
}

export function abroadDays(a: Absence, today: Day): number {
  const range = abroadRange(a, today);
  return range ? daysBetween(range.from, range.to) + 1 : 0;
}

function calendarDays(a: Absence, today: Day): number {
  const end = a.return ?? today;
  return end < a.leave ? 1 : daysBetween(a.leave, end) + 1;
}

/** Abroad days as a bitmap over [origin, end] with prefix sums, so any range is O(1). */
function buildAbroadIndex(origin: Day, end: Day, absences: Absence[], today: Day) {
  const length = daysBetween(origin, end) + 1;
  const abroad = new Uint8Array(length);
  for (const a of absences) {
    const range = abroadRange(a, today);
    if (!range) continue;
    const from = Math.max(0, daysBetween(origin, range.from));
    const to = Math.min(length - 1, daysBetween(origin, range.to));
    for (let i = from; i <= to; i++) abroad[i] = 1;
  }
  const prefix = new Int32Array(length + 1);
  for (let i = 0; i < length; i++) prefix[i + 1] = prefix[i]! + abroad[i]!;
  return {
    /** Abroad days in [from, to], inclusive, clamped to the index. */
    count(from: Day, to: Day): number {
      const i = Math.max(0, daysBetween(origin, from));
      const j = Math.min(length - 1, daysBetween(origin, to));
      return j < i ? 0 : prefix[j + 1]! - prefix[i]!;
    },
  };
}

export function computeSummary(settings: Settings, absences: Absence[], today: Day): Summary {
  const rule = PATH_RULES[settings.path];
  const P = settings.greenCardDate;
  const E = addDays(addYears(P, rule.years), -EARLY_FILING_DAYS);
  const horizon = addDays(maxDay(E, today), HORIZON_DAYS);
  const index = buildAbroadIndex(P, horizon, absences, today);

  // Presence counted toward filing on day d: the window ends AT the filing date.
  const presenceOn = (d: Day): number => {
    if (d < P) return 0;
    const start = maxDay(P, addYears(d, -rule.years));
    return daysBetween(start, d) + 1 - index.count(start, d);
  };

  let projectedApplyDate: Day | null = null;
  for (let d = E; d <= horizon; d = addDays(d, 1)) {
    if (presenceOn(d) >= rule.requiredDays) {
      projectedApplyDate = d;
      break;
    }
  }

  const started = today >= P;
  const daysAsPermanentResident = started ? daysBetween(P, today) + 1 : 0;
  const daysInUsSoFar = presenceOn(today);
  const daysAbroadSoFar = started ? index.count(P, today) : 0;
  const plannedAbroadDays = index.count(started ? addDays(today, 1) : P, horizon);
  const roomLeftDays = daysBetween(P, E) + 1 - rule.requiredDays - index.count(P, E);
  const countdownDays =
    projectedApplyDate === null ? null : Math.max(0, daysBetween(today, projectedApplyDate));

  const yearBars: YearBar[] = [];
  if (started) {
    for (let year = yearOf(P); year <= yearOf(today); year++) {
      const start = maxDay(P, `${year}-01-01`);
      const end = minDay(today, `${year}-12-31`);
      const elapsed = daysBetween(start, end) + 1;
      yearBars.push({ year, present: elapsed - index.count(start, end), elapsed });
    }
  }

  const sorted = [...absences].sort((a, b) => (a.leave < b.leave ? -1 : a.leave > b.leave ? 1 : 0));
  const counted = (a: Absence): CountedTrip => ({
    absence: a,
    calendarDays: calendarDays(a, today),
    abroadDays: abroadDays(a, today),
  });

  const target = projectedApplyDate ?? E;
  const windowStart = maxDay(P, addYears(target, -rule.years));
  const tripsThatCount = sorted
    .filter((a) => a.leave <= target && (a.return ?? today) >= windowStart)
    .map(counted);

  const upcoming = sorted.find((a) => a.leave > today);
  const nextTrip = upcoming
    ? { ...counted(upcoming), daysUntil: daysBetween(today, upcoming.leave) }
    : null;

  const warnings: Warning[] = [];
  for (const a of sorted) {
    const n = abroadDays(a, today);
    if (n >= BREAK_DAYS) warnings.push({ kind: "breaks_residence", absenceId: a.id, abroadDays: n });
    else if (n > PRESUMED_BREAK_DAYS) warnings.push({ kind: "presumed_break", absenceId: a.id, abroadDays: n });
    if (a.return === null) warnings.push({ kind: "return_not_logged", absenceId: a.id });
  }

  const status: PresenceStatus =
    projectedApplyDate === null || projectedApplyDate > E
      ? "behind"
      : warnings.some((w) => w.kind !== "return_not_logged")
        ? "at_risk"
        : "on_track";

  return {
    greenCardDate: P,
    earliestFilingDate: E,
    projectedApplyDate,
    requiredDays: rule.requiredDays,
    requiredMonths: rule.requiredMonths,
    daysAsPermanentResident,
    daysInUsSoFar,
    daysAbroadSoFar,
    plannedAbroadDays,
    roomLeftDays,
    countdownDays,
    progress: Math.min(1, daysInUsSoFar / rule.requiredDays),
    yearBars,
    tripsThatCount,
    nextTrip,
    warnings,
    status,
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest --run src/domain/presence.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat(domain): naturalization presence rules and summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Countries and trip classification (`countries.ts`, `absences.ts`)

**Files:**
- Create: `src/domain/countries.ts`, `src/domain/absences.ts`
- Test: `src/domain/absences.test.ts`

**Interfaces:**
- Consumes: `TripRecord`, `Absence`, `AbsenceSource` (Task 3); `isUsJurisdiction` (Task 3); `addDays` (Task 2).
- Produces: `countryName(code): string`; `flagEmoji(code): string`; `PICKER_COUNTRIES: { code; name }[]` (excludes the US jurisdictions); `TAG_ABSENCE`, `TAG_IGNORED`, `TAG_AUTO`; `foreignCountries(codes): string[]`; `classifyTrips(trips: TripRecord[]): Classification`, where `Classification = { absences: Absence[]; review: TripRecord[]; toTag: TripRecord[]; overlaps: Array<[string, string]> }`.

- [ ] **Step 1: Write the failing test** — `src/domain/absences.test.ts`

```ts
import { classifyTrips, foreignCountries } from "./absences";
import { PICKER_COUNTRIES, countryName, flagEmoji } from "./countries";
import type { TripRecord } from "./types";

const t = (over: Partial<TripRecord>): TripRecord => ({
  id: "t",
  name: "Trip",
  tags: [],
  countries: ["CA"],
  startDay: "2026-10-23",
  endDay: "2026-10-30",
  ...over,
});

describe("countries", () => {
  it("names and flags codes", () => {
    expect(countryName("CA")).toBe("Canada");
    expect(flagEmoji("CA")).toBe("🇨🇦");
  });
  it("leaves US jurisdictions out of the picker", () => {
    const codes = PICKER_COUNTRIES.map((c) => c.code);
    for (const us of ["US", "PR", "GU", "VI", "MP"]) expect(codes).not.toContain(us);
    expect(codes).toContain("CA");
  });
  it("filters US jurisdictions from a country list", () => {
    expect(foreignCountries(["US", "CA", "PR", "FR"])).toEqual(["CA", "FR"]);
  });
});

describe("classifyTrips", () => {
  it("counts tagged trips and drops US from their countries", () => {
    const c = classifyTrips([t({ id: "a", tags: ["us-absence"], countries: ["US", "CA"] })]);
    expect(c.absences).toEqual([
      { id: "a", name: "Trip", countries: ["CA"], leave: "2026-10-23", return: "2026-10-30", source: "manual" },
    ]);
    expect(c.toTag).toEqual([]);
  });

  it("marks flight-created trips as auto", () => {
    const c = classifyTrips([t({ tags: ["us-absence", "auto"] })]);
    expect(c.absences[0]!.source).toBe("auto");
  });

  it("skips ignored trips entirely", () => {
    const c = classifyTrips([t({ tags: ["us-absence", "us-absence-ignored"] })]);
    expect(c.absences).toEqual([]);
    expect(c.review).toEqual([]);
  });

  it("counts and tags untagged trips that are entirely outside the US", () => {
    const trip = t({ id: "b", countries: ["FR", "IT"] });
    const c = classifyTrips([trip]);
    expect(c.absences[0]).toMatchObject({ id: "b", source: "travstats", countries: ["FR", "IT"] });
    expect(c.toTag).toEqual([trip]);
  });

  it("sends doubtful untagged trips to review", () => {
    const withUs = t({ id: "c", countries: ["US", "FR"] });
    const noCountry = t({ id: "d", countries: [] });
    const noDate = t({ id: "e", startDay: null });
    const puertoRico = t({ id: "f", countries: ["PR"] });
    const c = classifyTrips([withUs, noCountry, noDate, puertoRico]);
    expect(c.absences).toEqual([]);
    expect(c.review.map((r) => r.id)).toEqual(["c", "d", "e", "f"]);
  });

  it("sends a tagged trip without a start date to review", () => {
    const c = classifyTrips([t({ id: "g", tags: ["us-absence"], startDay: null })]);
    expect(c.review.map((r) => r.id)).toEqual(["g"]);
  });

  it("reports absences whose abroad days overlap, but not back-to-back ones", () => {
    const c = classifyTrips([
      t({ id: "a", tags: ["us-absence"], startDay: "2026-10-01", endDay: "2026-10-10" }),
      t({ id: "b", tags: ["us-absence"], startDay: "2026-10-05", endDay: "2026-10-15" }),
      t({ id: "c", tags: ["us-absence"], startDay: "2026-10-15", endDay: "2026-10-20" }),
    ]);
    expect(c.overlaps).toEqual([["a", "b"]]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/domain/absences.test.ts`
Expected: FAIL — `Failed to resolve import "./absences"`.

- [ ] **Step 3: Implement**

`src/domain/countries.ts`:
```ts
import { isUsJurisdiction } from "./rules";

const ISO_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS " +
  "BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE " +
  "EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM " +
  "HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC " +
  "LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA " +
  "NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO " +
  "TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Every country a trip can go to — the US jurisdictions are not "abroad". */
export const PICKER_COUNTRIES = ISO_CODES.filter((code) => !isUsJurisdiction(code))
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));
```

`src/domain/absences.ts`:
```ts
import { addDays, type Day } from "./dates";
import { isUsJurisdiction } from "./rules";
import type { Absence, AbsenceSource, TripRecord } from "./types";

export const TAG_ABSENCE = "us-absence";
export const TAG_IGNORED = "us-absence-ignored";
export const TAG_AUTO = "auto";

export interface Classification {
  absences: Absence[];
  /** TravStats trips that might be absences; the user decides Count or Ignore. */
  review: TripRecord[];
  /** Untagged trips that count by rule and should be tagged in TravStats. */
  toTag: TripRecord[];
  /** Pairs of absence ids whose abroad days overlap. */
  overlaps: Array<[string, string]>;
}

export function foreignCountries(countries: string[]): string[] {
  return countries.filter((code) => !isUsJurisdiction(code));
}

function sourceOf(trip: TripRecord): AbsenceSource {
  if (trip.tags.includes(TAG_AUTO)) return "auto";
  if (trip.tags.includes(TAG_ABSENCE)) return "manual";
  return "travstats";
}

function toAbsence(trip: TripRecord, leave: Day): Absence {
  return {
    id: trip.id,
    name: trip.name,
    countries: foreignCountries(trip.countries),
    leave,
    return: trip.endDay,
    source: sourceOf(trip),
  };
}

const FAR_FUTURE = "9999-12-30";

function abroadSpan(a: Absence): [Day, Day] | null {
  const from = addDays(a.leave, 1);
  const to = a.return === null ? FAR_FUTURE : addDays(a.return, -1);
  return from <= to ? [from, to] : null;
}

export function findOverlaps(absences: Absence[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < absences.length; i++) {
    for (let j = i + 1; j < absences.length; j++) {
      const a = abroadSpan(absences[i]!);
      const b = abroadSpan(absences[j]!);
      if (a && b && a[0] <= b[1] && b[0] <= a[1]) out.push([absences[i]!.id, absences[j]!.id]);
    }
  }
  return out;
}

export function classifyTrips(trips: TripRecord[]): Classification {
  const absences: Absence[] = [];
  const review: TripRecord[] = [];
  const toTag: TripRecord[] = [];
  for (const trip of trips) {
    if (trip.tags.includes(TAG_IGNORED)) continue;
    if (trip.tags.includes(TAG_ABSENCE)) {
      if (trip.startDay) absences.push(toAbsence(trip, trip.startDay));
      else review.push(trip);
      continue;
    }
    const entirelyForeign =
      trip.countries.length > 0 && foreignCountries(trip.countries).length === trip.countries.length;
    if (trip.startDay && entirelyForeign) {
      absences.push(toAbsence(trip, trip.startDay));
      toTag.push(trip);
    } else {
      review.push(trip);
    }
  }
  return { absences, review, toTag, overlaps: findOverlaps(absences) };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest --run src/domain/absences.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/countries.ts src/domain/absences.ts src/domain/absences.test.ts
git commit -m "feat(domain): classify TravStats trips into absences and review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Flights → candidate absences (`sync/flightPairing.ts`)

**Files:**
- Create: `src/sync/flightPairing.ts`
- Test: `src/sync/flightPairing.test.ts`

**Interfaces:**
- Consumes: `FlightRecord` (Task 3), `isUsJurisdiction` (Task 3), `Day` (Task 2).
- Produces: `Candidate { flightIds: string[]; tripIds: string[]; looseFlightIds: string[]; countries: string[]; leave: Day; return: Day | null; planned: boolean }`; `Notice = { kind: "orphan_entry"; flightId; day } | { kind: "return_assumed"; flightId; day } | { kind: "date_uncertain"; flightId }`; `pairFlights(flights: FlightRecord[]): { candidates: Candidate[]; notices: Notice[] }`.

- [ ] **Step 1: Write the failing test** — `src/sync/flightPairing.test.ts`

```ts
import { pairFlights } from "./flightPairing";
import type { FlightRecord } from "../domain/types";

let seq = 0;
function flight(
  dep: string,
  arr: string,
  depLocal: string,
  arrLocal: string,
  over: Partial<FlightRecord> = {}
): FlightRecord {
  seq += 1;
  return {
    id: `f${seq}`,
    status: "flown",
    depCountry: dep,
    arrCountry: arr,
    departure: { utc: `${depLocal}:00Z`, local: depLocal, precision: "minute" },
    arrival: { utc: `${arrLocal}:00Z`, local: arrLocal, precision: "minute" },
    tripId: null,
    ...over,
  };
}

describe("pairFlights", () => {
  it("pairs an out-and-back into one absence", () => {
    const out = flight("US", "CA", "2026-10-23T08:00", "2026-10-23T10:00");
    const back = flight("CA", "US", "2026-10-30T18:00", "2026-10-30T20:00");
    const { candidates, notices } = pairFlights([back, out]);
    expect(candidates).toEqual([
      {
        flightIds: [out.id, back.id],
        tripIds: [],
        looseFlightIds: [out.id, back.id],
        countries: ["CA"],
        leave: "2026-10-23",
        return: "2026-10-30",
        planned: false,
      },
    ]);
    expect(notices).toEqual([]);
  });

  it("collects every country of a multi-city trip", () => {
    const { candidates } = pairFlights([
      flight("US", "FR", "2027-05-01T18:00", "2027-05-02T08:00"),
      flight("FR", "IT", "2027-05-05T09:00", "2027-05-05T11:00"),
      flight("IT", "US", "2027-05-12T10:00", "2027-05-12T14:00"),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.countries).toEqual(["FR", "IT"]);
    expect(candidates[0]!.leave).toBe("2027-05-01");
    expect(candidates[0]!.return).toBe("2027-05-12");
  });

  it("leaves an exit without a return open", () => {
    const { candidates } = pairFlights([flight("US", "MX", "2026-10-01T08:00", "2026-10-01T11:00")]);
    expect(candidates[0]!.return).toBeNull();
  });

  it("reports an entry with no departure as an orphan", () => {
    const back = flight("CA", "US", "2026-11-02T18:00", "2026-11-02T20:00");
    const { candidates, notices } = pairFlights([back]);
    expect(candidates).toEqual([]);
    expect(notices).toEqual([{ kind: "orphan_entry", flightId: back.id, day: "2026-11-02" }]);
  });

  it("ignores domestic flights and trips to US territories", () => {
    const { candidates, notices } = pairFlights([
      flight("US", "US", "2026-10-01T08:00", "2026-10-01T11:00"),
      flight("US", "PR", "2026-12-20T08:00", "2026-12-20T12:00"),
      flight("PR", "US", "2026-12-27T13:00", "2026-12-27T17:00"),
    ]);
    expect(candidates).toEqual([]);
    expect(notices).toEqual([]);
  });

  it("closes an absence at the next exit when the return was not flown", () => {
    const toMexico = flight("US", "MX", "2026-10-01T08:00", "2026-10-01T11:00");
    const toCanada = flight("US", "CA", "2026-10-20T08:00", "2026-10-20T10:00");
    const back = flight("CA", "US", "2026-10-25T18:00", "2026-10-25T20:00");
    const { candidates, notices } = pairFlights([toMexico, toCanada, back]);
    expect(candidates.map((c) => [c.countries, c.leave, c.return])).toEqual([
      [["MX"], "2026-10-01", "2026-10-20"],
      [["CA"], "2026-10-20", "2026-10-25"],
    ]);
    expect(notices).toContainEqual({ kind: "return_assumed", flightId: toCanada.id, day: "2026-10-20" });
  });

  it("takes the local day, not the UTC day", () => {
    const late = flight("US", "MX", "2026-12-31T18:00", "2026-12-31T23:00");
    late.departure = { utc: "2027-01-01T02:00:00Z", local: "2026-12-31T18:00", precision: "minute" };
    expect(pairFlights([late]).candidates[0]!.leave).toBe("2026-12-31");
  });

  it("skips cancelled flights, flags uncertain dates and marks scheduled ones planned", () => {
    const cancelled = flight("US", "CA", "2026-10-02T08:00", "2026-10-02T10:00", { status: "cancelled" });
    const fuzzy = flight("US", "CA", "2026-11-01T12:00", "2026-11-01T14:00", { status: "scheduled" });
    fuzzy.departure = { ...fuzzy.departure!, precision: "unknown" };
    const { candidates, notices } = pairFlights([cancelled, fuzzy]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.planned).toBe(true);
    expect(notices).toEqual([{ kind: "date_uncertain", flightId: fuzzy.id }]);
  });

  it("separates flights that already belong to a trip", () => {
    const out = flight("US", "CA", "2026-10-23T08:00", "2026-10-23T10:00", { tripId: "t9" });
    const back = flight("CA", "US", "2026-10-30T18:00", "2026-10-30T20:00");
    const c = pairFlights([out, back]).candidates[0]!;
    expect(c.tripIds).toEqual(["t9"]);
    expect(c.looseFlightIds).toEqual([back.id]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/sync/flightPairing.test.ts`
Expected: FAIL — `Failed to resolve import "./flightPairing"`.

- [ ] **Step 3: Implement** — `src/sync/flightPairing.ts`

```ts
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
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest --run src/sync/flightPairing.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/flightPairing.ts src/sync/flightPairing.test.ts
git commit -m "feat(sync): pair US exit and entry flights into absences

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reconcile candidates with TravStats trips (`sync/reconcile.ts`)

**Files:**
- Create: `src/sync/reconcile.ts`
- Test: `src/sync/reconcile.test.ts`

**Interfaces:**
- Consumes: `Candidate` (Task 5); `TripRecord` (Task 3); `TAG_ABSENCE`, `TAG_IGNORED`, `TAG_AUTO`, `foreignCountries` (Task 4); `countryName` (Task 4).
- Produces: `TripFields { name: string; countries: string[]; startDate: Day; endDate: Day | null }`; `Op = { kind: "create"; fields: TripFields; tags: string[]; flightIds: string[] } | { kind: "tag"; tripId: string; tags: string[] } | { kind: "attach"; tripId: string; flightIds: string[] } | { kind: "update"; tripId: string; fields: TripFields }`; `tripName(countries): string`; `reconcile(candidates, trips): Op[]`.

- [ ] **Step 1: Write the failing test** — `src/sync/reconcile.test.ts`

```ts
import { reconcile, tripName } from "./reconcile";
import type { Candidate } from "./flightPairing";
import type { TripRecord } from "../domain/types";

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  flightIds: ["f1", "f2"],
  tripIds: [],
  looseFlightIds: ["f1", "f2"],
  countries: ["CA"],
  leave: "2026-10-23",
  return: "2026-10-30",
  planned: false,
  ...over,
});
const trip = (over: Partial<TripRecord>): TripRecord => ({
  id: "t1",
  name: "Canada",
  tags: [],
  countries: ["CA"],
  startDay: "2026-10-23",
  endDay: "2026-10-30",
  ...over,
});
const fields = { name: "Canada", countries: ["CA"], startDate: "2026-10-23", endDate: "2026-10-30" };

describe("reconcile", () => {
  it("names trips from their countries", () => {
    expect(tripName(["CA", "FR"])).toBe("Canada, France");
    expect(tripName([])).toBe("Abroad");
  });

  it("creates a tagged trip for flights that have none", () => {
    expect(reconcile([candidate()], [])).toEqual([
      { kind: "create", fields, tags: ["us-absence", "auto"], flightIds: ["f1", "f2"] },
    ]);
  });

  it("tags the trip the flights already belong to and attaches the rest", () => {
    const owner = trip({ id: "t9", name: "Toronto weekend", tags: ["family"] });
    const ops = reconcile([candidate({ tripIds: ["t9"], looseFlightIds: ["f2"] })], [owner]);
    expect(ops).toEqual([
      { kind: "tag", tripId: "t9", tags: ["family", "us-absence"] },
      { kind: "attach", tripId: "t9", flightIds: ["f2"] },
    ]);
  });

  it("leaves flights of an ignored trip alone", () => {
    const ignored = trip({ id: "t9", tags: ["us-absence-ignored"] });
    expect(reconcile([candidate({ tripIds: ["t9"], looseFlightIds: [] })], [ignored])).toEqual([]);
  });

  it("never moves flights whose trip it cannot see", () => {
    expect(reconcile([candidate({ tripIds: ["unknown"], looseFlightIds: ["f2"] })], [])).toEqual([]);
  });

  it("attaches flights to an overlapping manual absence without rewriting it", () => {
    const manual = trip({ id: "m1", tags: ["us-absence"], startDay: "2026-10-22", endDay: "2026-10-31" });
    expect(reconcile([candidate()], [manual])).toEqual([
      { kind: "attach", tripId: "m1", flightIds: ["f1", "f2"] },
    ]);
  });

  it("rewrites an auto trip whose flights changed", () => {
    const auto = trip({ id: "a1", tags: ["us-absence", "auto"], endDay: "2026-10-29" });
    const ops = reconcile([candidate({ tripIds: ["a1"], looseFlightIds: [] })], [auto]);
    expect(ops).toEqual([{ kind: "update", tripId: "a1", fields }]);
  });

  it("is idempotent once its ops are applied", () => {
    const applied = trip({ id: "new", tags: ["us-absence", "auto"], countries: ["US", "CA"] });
    expect(reconcile([candidate({ tripIds: ["new"], looseFlightIds: [] })], [applied])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/sync/reconcile.test.ts`
Expected: FAIL — `Failed to resolve import "./reconcile"`.

- [ ] **Step 3: Implement** — `src/sync/reconcile.ts`

```ts
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
  const want = [...f.countries].sort().join(",");
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
export function reconcile(candidates: Candidate[], trips: TripRecord[]): Op[] {
  const byId = new Map(trips.map((t) => [t.id, t]));
  const ops: Op[] = [];
  const tagged = new Set<string>();

  for (const c of candidates) {
    const fields = fieldsFor(c);
    const owner = c.tripIds.map((id) => byId.get(id)).find((t): t is TripRecord => t !== undefined);
    if (c.tripIds.length > 0 && !owner) continue;

    const target = owner ?? trips.find((t) => counts(t) && overlaps(t, c));
    if (!target) {
      ops.push({ kind: "create", fields, tags: [TAG_ABSENCE, TAG_AUTO], flightIds: c.flightIds });
      continue;
    }
    if (target.tags.includes(TAG_IGNORED)) continue;

    if (!target.tags.includes(TAG_ABSENCE) && !tagged.has(target.id)) {
      ops.push({ kind: "tag", tripId: target.id, tags: [...target.tags, TAG_ABSENCE] });
      tagged.add(target.id);
    }
    if (c.looseFlightIds.length > 0) {
      ops.push({ kind: "attach", tripId: target.id, flightIds: c.looseFlightIds });
    }
    if (target.tags.includes(TAG_AUTO) && !sameFields(target, fields)) {
      ops.push({ kind: "update", tripId: target.id, fields });
    }
  }
  return ops;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest --run src/sync/reconcile.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/reconcile.ts src/sync/reconcile.test.ts
git commit -m "feat(sync): reconcile flight absences with TravStats trips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: TravStats API client (`api/`)

**Files:**
- Create: `src/api/client.ts`, `src/api/schemas.ts`, `src/api/travstats.ts`
- Test: `src/api/travstats.test.ts`

**Interfaces:**
- Consumes: `TripRecord`, `FlightRecord`, `Settings` (Task 3); `isDay` (Task 2).
- Produces:
  - `class AuthError`; `class ApiError { status: number }`; `request(path, schema, init?)`.
  - `User { username: string; firstName: string | null }`.
  - `TripInput { name; countries: string[]; startDate: Day; endDate: Day | null; tags: string[] }`.
  - `LoginResult = "ok" | "two_factor" | "password_change"`.
  - `interface TravStatsApi { login(u, p): Promise<LoginResult>; verifyTwoFactor(code): Promise<void>; logout(): Promise<void>; me(): Promise<User>; listTrips(): Promise<TripRecord[]>; listFlights(): Promise<FlightRecord[]>; createTrip(input: TripInput): Promise<TripRecord>; updateTrip(id, patch: Partial<TripInput>): Promise<TripRecord>; deleteTrip(id): Promise<void>; assignFlights(tripId, flightIds): Promise<void>; getSettings(): Promise<Settings | null>; saveSettings(s: Settings): Promise<void> }`.
  - `travstats: TravStatsApi`.

- [ ] **Step 1: Write the failing test** — `src/api/travstats.test.ts`

```ts
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/api/travstats.test.ts`
Expected: FAIL — `Failed to resolve import "./client"`.

- [ ] **Step 3: Implement**

`src/api/client.ts`:
```ts
import type { z } from "zod";

export class AuthError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error;
    const nested = b.error as Record<string, unknown> | undefined;
    if (nested && typeof nested.message === "string") return nested.message;
    if (typeof b.message === "string") return b.message;
  }
  return `TravStats answered HTTP ${status}`;
}

/** One call to TravStats through the same-origin /api/v1 proxy. */
export async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init: { method?: string; json?: unknown } = {}
): Promise<z.infer<S>> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.json === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  });
  if (res.status === 401) throw new AuthError();
  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.status));
  return schema.parse(body);
}
```

`src/api/schemas.ts`:
```ts
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
```

`src/api/travstats.ts`:
```ts
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
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest --run src/api/travstats.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api
git commit -m "feat(api): TravStats client with zod-validated responses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Apply ops and load everything (`applyOps.ts`, `loadTravelData.ts`)

**Files:**
- Create: `src/sync/applyOps.ts`, `src/state/loadTravelData.ts`
- Test: `src/state/loadTravelData.test.ts`

**Interfaces:**
- Consumes: `Op` (Task 6); `TravStatsApi`, `User`, `AuthError` (Task 7); `pairFlights`, `Notice` (Task 5); `classifyTrips`, `Classification`, `TAG_ABSENCE` (Task 4); `computeSummary`, `Summary` (Task 3).
- Produces: `applyOps(api, ops): Promise<{ applied: number; error: string | null }>` (rethrows `AuthError`); `TravelData { user; settings: Settings | null; trips: TripRecord[]; classification: Classification; notices: Notice[]; summary: Summary | null; syncError: string | null; today: Day }`; `loadTravelData(api, today): Promise<TravelData>`.

- [ ] **Step 1: Write the failing test** — `src/state/loadTravelData.test.ts`

```ts
import { applyOps } from "../sync/applyOps";
import { loadTravelData } from "./loadTravelData";
import { AuthError } from "../api/client";
import type { TravStatsApi, TripInput } from "../api/travstats";
import type { FlightRecord, TripRecord } from "../domain/types";

function fakeApi(flights: FlightRecord[], trips: TripRecord[]) {
  const log: string[] = [];
  const api: TravStatsApi = {
    login: async () => "ok",
    verifyTwoFactor: async () => {},
    logout: async () => {},
    me: async () => ({ username: "ohmz", firstName: "Omar" }),
    getSettings: async () => ({ greenCardDate: "2026-09-01", path: "spouse3" }),
    saveSettings: async () => {},
    listFlights: async () => flights,
    listTrips: async () => {
      log.push("listTrips");
      return trips.map((t) => ({ ...t }));
    },
    createTrip: async (input: TripInput) => {
      log.push(`create:${input.name}`);
      const created: TripRecord = {
        id: `new${trips.length}`,
        name: input.name,
        tags: input.tags,
        countries: input.countries,
        startDay: input.startDate,
        endDay: input.endDate,
      };
      trips.push(created);
      return created;
    },
    updateTrip: async (id, patch) => {
      log.push(`update:${id}:${(patch.tags ?? []).join("+")}`);
      const t = trips.find((x) => x.id === id) ?? { id, name: "", tags: [], countries: [], startDay: null, endDay: null };
      if (patch.tags) t.tags = patch.tags;
      return t;
    },
    deleteTrip: async () => {},
    assignFlights: async (tripId, ids) => {
      log.push(`attach:${tripId}:${ids.join(",")}`);
      for (const f of flights) if (ids.includes(f.id)) f.tripId = tripId;
    },
  };
  return { api, log };
}

const leg = (id: string, dep: string, arr: string, local: string): FlightRecord => ({
  id,
  status: "scheduled",
  depCountry: dep,
  arrCountry: arr,
  departure: { utc: `${local}:00Z`, local, precision: "minute" },
  arrival: { utc: `${local}:00Z`, local, precision: "minute" },
  tripId: null,
});

describe("loadTravelData", () => {
  it("creates the trip implied by flights, reloads, and summarizes", async () => {
    const flights = [leg("f1", "US", "CA", "2026-10-23T08:00"), leg("f2", "CA", "US", "2026-10-30T18:00")];
    const { api, log } = fakeApi(flights, []);
    const data = await loadTravelData(api, "2026-10-07");
    expect(log).toEqual(["listTrips", "create:Canada", "attach:new0:f1,f2", "listTrips"]);
    expect(data.classification.absences).toHaveLength(1);
    expect(data.summary?.plannedAbroadDays).toBe(6);
    expect(data.syncError).toBeNull();

    log.length = 0;
    await loadTravelData(api, "2026-10-07");
    expect(log).toEqual(["listTrips"]);
  });

  it("tags untagged foreign trips it counts", async () => {
    const europe: TripRecord = {
      id: "e1",
      name: "Europe",
      tags: [],
      countries: ["FR"],
      startDay: "2027-05-01",
      endDay: "2027-05-10",
    };
    const { api, log } = fakeApi([], [europe]);
    const data = await loadTravelData(api, "2026-10-07");
    expect(log).toContain("update:e1:us-absence");
    expect(data.classification.absences.map((a) => a.id)).toEqual(["e1"]);
  });
});

describe("applyOps", () => {
  it("stops at the first failure and reports it", async () => {
    const { api } = fakeApi([], []);
    api.assignFlights = async () => {
      throw new Error("boom");
    };
    const result = await applyOps(api, [
      { kind: "tag", tripId: "x", tags: ["us-absence"] },
      { kind: "attach", tripId: "x", flightIds: ["f1"] },
      { kind: "tag", tripId: "y", tags: ["us-absence"] },
    ]);
    expect(result).toEqual({ applied: 1, error: "boom" });
  });

  it("rethrows an expired session", async () => {
    const { api } = fakeApi([], []);
    api.updateTrip = async () => {
      throw new AuthError();
    };
    await expect(applyOps(api, [{ kind: "tag", tripId: "x", tags: [] }])).rejects.toBeInstanceOf(AuthError);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/state/loadTravelData.test.ts`
Expected: FAIL — `Failed to resolve import "../sync/applyOps"`.

- [ ] **Step 3: Implement**

`src/sync/applyOps.ts`:
```ts
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
```

`src/state/loadTravelData.ts`:
```ts
import type { TravStatsApi, User } from "../api/travstats";
import { TAG_ABSENCE, classifyTrips, type Classification } from "../domain/absences";
import type { Day } from "../domain/dates";
import { computeSummary, type Summary } from "../domain/presence";
import type { Settings, TripRecord } from "../domain/types";
import { applyOps } from "../sync/applyOps";
import { pairFlights, type Notice } from "../sync/flightPairing";
import { reconcile, type Op } from "../sync/reconcile";

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

  const flightOps = reconcile(candidates, trips);
  if (flightOps.length > 0) {
    syncError = (await applyOps(api, flightOps)).error;
    trips = await api.listTrips();
  }

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
  return { user, settings, trips, classification, notices, summary, syncError, today };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest --run src/state/loadTravelData.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/applyOps.ts src/state
git commit -m "feat(state): load TravStats data, sync flight absences, summarize

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: App shell — styles, formatting, auth gate, nav, login

**Files:**
- Create: `src/styles.css`, `src/ui/format.ts`, `src/state/DataContext.tsx`, `src/components/BottomNav.tsx`, `src/components/Banner.tsx`, `src/pages/LoginPage.tsx`
- Modify: `src/App.tsx` (replace), `src/main.tsx` (import the styles)
- Delete: `src/smoke.test.ts`
- Test: `src/ui/format.test.ts`

**Interfaces:**
- Consumes: `loadTravelData`, `TravelData` (Task 8); `travstats`, `AuthError`, `TravStatsApi` (Task 7); `todayIn`, `diffYMD`, `yearOf` (Task 2).
- Produces: `formatYMD(from, to)`, `formatDayCount(n)`, `formatLongDay(d)`, `formatRange(leave, ret)`, `greetingFor(hour)`; `DataProvider`, `useData(): { state; refresh }` with `state = { phase: "loading" } | { phase: "signed_out" } | { phase: "error"; message } | { phase: "ready"; data: TravelData }`; `<Banner tone="amber" | "red" | "green">`; `<BottomNav />`; `<LoginPage onSignedIn api? />`. Pages created in Tasks 10–12 are imported by `App.tsx`. Until those tasks land, `App.tsx` renders a placeholder `<p>` in their routes, as shown in Step 3.

- [ ] **Step 1: Write the failing test** — `src/ui/format.test.ts`

```ts
import { formatDayCount, formatLongDay, formatRange, formatYMD, greetingFor } from "./format";

describe("format", () => {
  it("formats calendar spans like the reference app", () => {
    expect(formatYMD("2026-09-01", "2026-10-08")).toBe("1 month 7 days");
    expect(formatYMD("2026-10-07", "2029-06-03")).toBe("2 years 7 months 27 days");
    expect(formatYMD("2026-10-07", "2026-10-07")).toBe("0 days");
    expect(formatYMD("2026-10-07", "2027-10-07")).toBe("1 year");
  });
  it("formats day counts as months and days", () => {
    expect(formatDayCount(0)).toBe("0 days");
    expect(formatDayCount(1)).toBe("1 day");
    expect(formatDayCount(30)).toBe("30 days");
    expect(formatDayCount(37)).toBe("1 mo 6 d");
    expect(formatDayCount(548)).toBe("18 mo 0 d");
    expect(formatDayCount(-57)).toBe("-1 mo 26 d");
  });
  it("formats days and ranges", () => {
    expect(formatLongDay("2029-06-03")).toBe("June 3, 2029");
    expect(formatRange("2026-10-23", "2026-10-30")).toBe("Oct 23 - Oct 30, 2026");
    expect(formatRange("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026 - Jan 3, 2027");
    expect(formatRange("2026-10-01", null)).toBe("Oct 1, 2026 - return not logged");
  });
  it("greets by hour", () => {
    expect(greetingFor(9)).toBe("Good morning");
    expect(greetingFor(16)).toBe("Good afternoon");
    expect(greetingFor(21)).toBe("Good evening");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/ui/format.test.ts`
Expected: FAIL — `Failed to resolve import "./format"`.

- [ ] **Step 3: Implement**

`src/ui/format.ts`:
```ts
import { diffYMD, yearOf, type Day } from "../domain/dates";

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
const AVG_MONTH_DAYS = 30.4375;

/** "2 years 7 months 27 days" — calendar difference, zero parts left out. */
export function formatYMD(from: Day, to: Day): string {
  const { years, months, days } = diffYMD(from, to);
  const parts: string[] = [];
  if (years) parts.push(plural(years, "year"));
  if (months) parts.push(plural(months, "month"));
  if (days || parts.length === 0) parts.push(plural(days, "day"));
  return parts.join(" ");
}

/** "1 mo 6 d" for a count of days, using an average month; under a month stays in days. */
export function formatDayCount(n: number): string {
  if (n < 0) return `-${formatDayCount(-n)}`;
  const months = Math.floor(n / AVG_MONTH_DAYS);
  if (months === 0) return plural(n, "day");
  return `${months} mo ${Math.floor(n - months * AVG_MONTH_DAYS)} d`;
}

const asUtc = (day: Day) => new Date(`${day}T00:00:00Z`);
const LONG = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

export const formatLongDay = (day: Day): string => LONG.format(asUtc(day));

export function formatRange(leave: Day, ret: Day | null): string {
  const start = SHORT.format(asUtc(leave));
  if (ret === null) return `${start}, ${yearOf(leave)} - return not logged`;
  const end = SHORT.format(asUtc(ret));
  return yearOf(leave) === yearOf(ret)
    ? `${start} - ${end}, ${yearOf(ret)}`
    : `${start}, ${yearOf(leave)} - ${end}, ${yearOf(ret)}`;
}

export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
```

`src/state/DataContext.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AuthError } from "../api/client";
import { travstats, type TravStatsApi } from "../api/travstats";
import { todayIn } from "../domain/dates";
import { loadTravelData, type TravelData } from "./loadTravelData";

export type DataState =
  | { phase: "loading" }
  | { phase: "signed_out" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: TravelData };

interface DataContextValue {
  state: DataState;
  refresh: () => Promise<void>;
  api: TravStatsApi;
}

const DataContext = createContext<DataContextValue | null>(null);

// Module-level so the default keeps one identity: an inline arrow would change
// `refresh` on every render and re-run the load effect forever.
const systemNow = () => new Date();

export function DataProvider({
  children,
  api = travstats,
  now = systemNow,
}: {
  children: ReactNode;
  api?: TravStatsApi;
  now?: () => Date;
}) {
  const [state, setState] = useState<DataState>({ phase: "loading" });

  const refresh = useCallback(async () => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setState({ phase: "ready", data: await loadTravelData(api, todayIn(zone, now())) });
    } catch (e) {
      if (e instanceof AuthError) setState({ phase: "signed_out" });
      else setState({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [api, now]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <DataContext.Provider value={{ state, refresh, api }}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error("useData must be used inside <DataProvider>");
  return value;
}
```

`src/components/Banner.tsx`:
```tsx
import type { ReactNode } from "react";

export function Banner({ tone, children }: { tone: "amber" | "red" | "green"; children: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === "red" ? "alert" : "status"}>
      {children}
    </div>
  );
}
```

`src/components/BottomNav.tsx`:
```tsx
import { NavLink } from "react-router-dom";

const icons = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  trips: "M2 16l20-7-4-2-6 3-6-3-2 1 5 4-4 2-2-1-1 1 3 3z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3 2-1-1-3-2 .2-1.4-1.4.2-2-3-1-1 2h-2l-1-2-3 1 .2 2L6.6 8.2 4.6 8l-1 3 2 1v2l-2 1 1 3 2-.2 1.4 1.4-.2 2 3 1 1-2h2l1 2 3-1-.2-2 1.4-1.4 2 .2 1-3-2-1z",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function BottomNav() {
  const item = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? " active" : ""}`;
  return (
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/" end className={item}>
        <Icon d={icons.home} />
        Home
      </NavLink>
      <NavLink to="/trips" className={item}>
        <Icon d={icons.trips} />
        Trips
      </NavLink>
      <NavLink to="/settings" className={item}>
        <Icon d={icons.settings} />
        Settings
      </NavLink>
    </nav>
  );
}
```

`src/pages/LoginPage.tsx`:
```tsx
import { useState, type FormEvent } from "react";
import { AuthError } from "../api/client";
import type { TravStatsApi } from "../api/travstats";
import { Banner } from "../components/Banner";

export function LoginPage({ api, onSignedIn }: { api: TravStatsApi; onSignedIn: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "code">("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === "password") {
        const result = await api.login(username, password);
        if (result === "two_factor") {
          setStep("code");
          return;
        }
        if (result === "password_change") {
          setError("TravStats wants you to change your password first. Do that in TravStats, then sign in here.");
          return;
        }
      } else {
        await api.verifyTwoFactor(code);
      }
      await onSignedIn();
    } catch (err) {
      setError(err instanceof AuthError ? "That didn't work. Check your details and try again." : String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page login">
      <h1>Citizenship Tracker</h1>
      <p className="muted">Sign in with your TravStats account.</p>
      {error && <Banner tone="red">{error}</Banner>}
      <form className="card stack" onSubmit={submit}>
        {step === "password" ? (
          <>
            <label className="field">
              Username
              <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label className="field">
              Password
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        ) : (
          <label className="field">
            6-digit code from your authenticator
            <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Signing in…" : step === "password" ? "Sign in" : "Verify"}
        </button>
      </form>
    </main>
  );
}
```

`src/App.tsx` (pages from Tasks 10–12 are wired in those tasks; until then their routes show a placeholder):
```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { DataProvider, useData } from "./state/DataContext";
import { LoginPage } from "./pages/LoginPage";

function Shell() {
  const { state, refresh, api } = useData();
  if (state.phase === "loading") return <main className="page center muted">Loading…</main>;
  if (state.phase === "signed_out") return <LoginPage api={api} onSignedIn={refresh} />;
  if (state.phase === "error") {
    return (
      <main className="page center stack">
        <h1>Can't reach TravStats</h1>
        <p className="muted">{state.message}</p>
        <button className="button primary" onClick={() => void refresh()}>
          Retry
        </button>
      </main>
    );
  }
  return (
    <>
      <main className="page">
        <Routes>
          <Route path="/" element={<p>Home</p>} />
          <Route path="/trips" element={<p>Trips</p>} />
          <Route path="/settings" element={<p>Settings</p>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <Shell />
      </DataProvider>
    </BrowserRouter>
  );
}
```

Add the import `import "./styles.css";` as the first line of `src/main.tsx`.

`src/styles.css`:
```css
:root {
  --bg: #f4f3ee;
  --card: #ffffff;
  --ink: #1f2430;
  --ink-soft: #3c4456;
  --muted: #8a8f9c;
  --line: #e4e3dd;
  --dark: #222222;
  --dark-ink: #f4f3ee;
  --green: #5fcf98;
  --green-bg: #eef6f0;
  --amber: #e2a23b;
  --amber-bg: #fbf3e4;
  --red: #d9534f;
  --red-bg: #fbeceb;
  --radius: 24px;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink);
  background: var(--bg);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); }
a { color: inherit; }
h1 { font-size: 2rem; font-weight: 400; margin: 0; }
h2 { font-size: 1.6rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }
.page { max-width: 520px; margin: 0 auto; padding: 24px 16px 120px; }
.stack { display: flex; flex-direction: column; gap: 16px; }
.center { text-align: center; align-items: center; }
.muted { color: var(--muted); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 24px; }
.card-dark { background: var(--dark); color: var(--dark-ink); border-color: var(--dark); text-align: center; }
.card-center { text-align: center; }
.greeting { display: flex; align-items: center; gap: 12px; margin: 16px 0 24px; }
.greeting .logo { font-size: 2.4rem; }
.hero-title { font-size: 1.4rem; margin: 0 0 8px; }
.hero-value { font-size: 1.8rem; font-weight: 700; margin: 0 0 8px; }
.big-date { font-size: 2rem; font-weight: 700; margin: 8px 0 16px; }
.divider { border: 0; border-top: 1px solid var(--line); margin: 16px 0; }
.ring { display: block; margin: 0 auto 16px; }
.ring-track { stroke: var(--line); }
.ring-fill { stroke: var(--ink); transition: stroke-dashoffset 0.4s; }
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.tile { text-align: center; }
.tile-icon { font-size: 3rem; line-height: 1; }
.tile-value { font-size: 2.2rem; font-weight: 700; margin: 12px 0 4px; }
.tile-note { color: var(--muted); }
.status { border-left-width: 6px; display: flex; gap: 16px; align-items: flex-start; }
.status-green { background: var(--green-bg); border-color: var(--green); }
.status-amber { background: var(--amber-bg); border-color: var(--amber); }
.status-red { background: var(--red-bg); border-color: var(--red); }
.status h3 { margin: 0 0 6px; font-size: 1.15rem; }
.status p { margin: 0; color: var(--ink-soft); line-height: 1.35; }
.row-card { display: flex; gap: 16px; align-items: flex-start; }
.row-card h3 { margin: 0 0 6px; font-size: 1.15rem; }
.row-card p { margin: 4px 0 0; color: var(--ink-soft); }
.row-icon { font-size: 2rem; line-height: 1; }
.year-row { display: grid; grid-template-columns: 4rem 1fr; gap: 12px; align-items: center; margin-top: 8px; }
.year-bar { position: relative; height: 40px; border-radius: 12px; background: #d4d4d2; overflow: hidden; }
.year-fill { position: absolute; inset: 0 auto 0 0; background: var(--green); }
.year-label { position: absolute; right: 8px; top: 4px; bottom: 4px; display: flex; align-items: center; padding: 0 10px; border-radius: 10px; background: #5d5d5d; color: #fff; font-weight: 700; }
.banner { border-radius: 16px; padding: 12px 16px; }
.banner-green { background: var(--green-bg); }
.banner-amber { background: var(--amber-bg); }
.banner-red { background: var(--red-bg); }
.bottom-nav { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); width: min(480px, calc(100% - 32px)); display: flex; justify-content: space-around; padding: 12px 8px; border-radius: 32px; background: #1b1b1d; }
.nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; color: #8f8f95; text-decoration: none; font-size: 0.9rem; }
.nav-item.active { color: #fff; }
.trips-header { display: flex; gap: 12px; align-items: center; }
.segmented { flex: 1; display: flex; background: #111; border-radius: 32px; padding: 6px; }
.seg { flex: 1; border: 0; border-radius: 26px; padding: 12px; font-size: 1.1rem; background: transparent; color: #fff; }
.seg.active { background: #ececec; color: var(--ink); }
.seg:disabled { opacity: 0.6; }
.fab { width: 60px; height: 60px; border-radius: 50%; border: 0; background: #222; color: #fff; font-size: 2rem; }
.trip-row { display: flex; align-items: center; gap: 16px; width: 100%; text-align: left; font: inherit; cursor: pointer; }
.trip-row .flag { font-size: 2.2rem; }
.trip-row .grow { flex: 1; }
.trip-row h3 { margin: 0; font-size: 1.4rem; }
.trip-row .days { font-size: 1.6rem; }
.badge { display: inline-block; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; background: var(--line); margin-left: 6px; }
.sheet-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.3); display: flex; align-items: flex-end; z-index: 10; }
.sheet { width: 100%; max-width: 520px; margin: 0 auto; background: var(--bg); border-radius: 28px 28px 0 0; padding: 24px 16px 32px; }
.sheet-head { display: flex; justify-content: space-between; align-items: center; }
.field { display: flex; flex-direction: column; gap: 6px; color: var(--ink-soft); }
.field input, .field select { font: inherit; padding: 14px 16px; border: 1px solid #c9cdd6; border-radius: 16px; background: #fff; color: var(--ink); }
.button { font: inherit; border: 0; border-radius: 28px; padding: 16px; }
.button.primary { background: var(--ink); color: #fff; }
.button.primary:disabled { background: #c8cbd2; }
.button.ghost { background: transparent; color: var(--red); }
.icon-button { border: 0; background: transparent; font-size: 1.6rem; }
.fineprint { color: var(--muted); font-size: 0.8rem; text-align: center; margin-top: 24px; }
.login { padding-top: 64px; }
```

Delete `src/smoke.test.ts`.

- [ ] **Step 4: Run tests and the type-check**

Run: `npm test && npm run typecheck`
Expected: every suite passes (format: 4 tests), and tsc reports no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): app shell, auth gate, login, formatting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Settings page

**Files:**
- Create: `src/pages/SettingsPage.tsx`
- Modify: `src/App.tsx` (the `/settings` route)
- Test: `src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `TravelData` (Task 8); `TravStatsApi` (Task 7); `PATH_RULES`, `Path` (Task 3); `isDay` (Task 2); `Banner` (Task 9).
- Produces: `<SettingsPage data api onSaved />`.

- [ ] **Step 1: Write the failing test** — `src/pages/SettingsPage.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";
import type { TravStatsApi } from "../api/travstats";
import type { TravelData } from "../state/loadTravelData";

const data = {
  user: { username: "ohmz", firstName: "Omar" },
  settings: null,
} as unknown as TravelData;

describe("SettingsPage", () => {
  it("saves green card date and path, then refreshes", async () => {
    const saveSettings = vi.fn(async () => {});
    const onSaved = vi.fn(async () => {});
    render(<SettingsPage data={data} api={{ saveSettings } as unknown as TravStatsApi} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Green card date"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByLabelText(/3-year/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveSettings).toHaveBeenCalledWith({ greenCardDate: "2026-09-01", path: "spouse3" });
  });

  it("refuses to save without a date", async () => {
    const saveSettings = vi.fn(async () => {});
    render(<SettingsPage data={data} api={{ saveSettings } as unknown as TravStatsApi} onSaved={async () => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter your green card date.")).toBeTruthy();
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/pages/SettingsPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./SettingsPage"`.

- [ ] **Step 3: Implement** — `src/pages/SettingsPage.tsx`

```tsx
import { useState, type FormEvent } from "react";
import type { TravStatsApi } from "../api/travstats";
import { Banner } from "../components/Banner";
import { isDay } from "../domain/dates";
import { PATH_RULES, type Path } from "../domain/rules";
import type { TravelData } from "../state/loadTravelData";

export function SettingsPage({ data, api, onSaved }: { data: TravelData; api: TravStatsApi; onSaved: () => Promise<void> }) {
  const [greenCardDate, setGreenCardDate] = useState(data.settings?.greenCardDate ?? "");
  const [path, setPath] = useState<Path>(data.settings?.path ?? "spouse3");
  const [displayName, setDisplayName] = useState(data.settings?.displayName ?? "");
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!isDay(greenCardDate)) {
      setMessage({ tone: "red", text: "Enter your green card date." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const name = displayName.trim();
      await api.saveSettings({ greenCardDate, path, ...(name ? { displayName: name } : {}) });
      await onSaved();
      setMessage({ tone: "green", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "red", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout();
    await onSaved();
  }

  return (
    <div className="stack">
      <h1>Settings</h1>
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      <form className="card stack" onSubmit={save} noValidate>
        <label className="field">
          Green card date
          <input type="date" value={greenCardDate} onChange={(e) => setGreenCardDate(e.target.value)} />
        </label>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Path to citizenship</legend>
          {(Object.keys(PATH_RULES) as Path[]).map((p) => (
            <label key={p}>
              <input type="radio" name="path" checked={path === p} onChange={() => setPath(p)} /> {PATH_RULES[p].label}
            </label>
          ))}
        </fieldset>
        <label className="field">
          Name shown on Home (optional)
          <input value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <button className="button primary" disabled={busy}>
          Save
        </button>
      </form>
      <div className="card stack">
        <p className="muted">Signed in to TravStats as {data.user.username}.</p>
        <button className="button ghost" onClick={() => void logout()}>
          Log out
        </button>
      </div>
    </div>
  );
}
```

In `src/App.tsx`: add `import { SettingsPage } from "./pages/SettingsPage";`, and replace the `/settings` route element with `<SettingsPage data={state.data} api={api} onSaved={refresh} />`.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest --run src/pages/SettingsPage.test.tsx && npm run typecheck`
Expected: PASS (2 tests), with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SettingsPage.tsx src/pages/SettingsPage.test.tsx src/App.tsx
git commit -m "feat(ui): settings for green card date and path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Home dashboard

**Files:**
- Create: `src/pages/HomePage.tsx`, `src/components/HeroCard.tsx`, `src/components/ApplyDateCard.tsx`, `src/components/StatTile.tsx`, `src/components/StatusCard.tsx`, `src/components/NoticeCards.tsx`, `src/components/NextTripCard.tsx`, `src/components/TripsThatCount.tsx`, `src/components/YearBars.tsx`
- Modify: `src/App.tsx` (the `/` route)
- Test: `src/pages/HomePage.test.tsx`

**Interfaces:**
- Consumes: `TravelData` (Task 8); `Summary`, `NextTrip`, `CountedTrip`, `YearBar`, `Warning` (Task 3); `Notice` (Task 5); `flagEmoji`, `countryName` (Task 4); `tripName` (Task 6); everything in format (Task 9); `addDays` (Task 2).
- Produces: `<HomePage data hour? />` (`hour` defaults to the browser's current hour and exists so tests are deterministic).

- [ ] **Step 1: Write the failing test** — `src/pages/HomePage.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import { computeSummary } from "../domain/presence";
import type { Absence, Settings } from "../domain/types";
import type { TravelData } from "../state/loadTravelData";

const settings: Settings = { greenCardDate: "2026-09-01", path: "spouse3", displayName: "James" };
const canada: Absence = { id: "t1", name: "Canada", countries: ["CA"], leave: "2026-10-23", return: "2026-10-30", source: "manual" };

function renderHome(over: Partial<TravelData> = {}) {
  const data: TravelData = {
    user: { username: "ohmz", firstName: "Omar" },
    settings,
    trips: [],
    classification: { absences: [canada], review: [], toTag: [], overlaps: [] },
    notices: [],
    summary: computeSummary(settings, [canada], "2026-10-07"),
    syncError: null,
    today: "2026-10-07",
    ...over,
  };
  return render(
    <MemoryRouter>
      <HomePage data={data} hour={16} />
    </MemoryRouter>
  );
}

describe("HomePage", () => {
  it("shows the reference dashboard figures", () => {
    renderHome();
    expect(screen.getByText("Good afternoon, James")).toBeTruthy();
    expect(screen.getByText("1 month 7 days")).toBeTruthy();
    expect(screen.getByText("(since September 1, 2026)")).toBeTruthy();
    expect(screen.getByText("June 3, 2029")).toBeTruthy();
    expect(screen.getByText("2 years 7 months 27 days")).toBeTruthy();
    // Shown on the "In USA" tile and again inside the status card.
    expect(screen.getAllByText("1 mo 6 d").length).toBeGreaterThan(0);
    expect(screen.getByText("(18 months required)")).toBeTruthy();
    expect(screen.getByText("Your Canada trip is in 16 days")).toBeTruthy();
    expect(screen.getByText(/Oct 23 - Oct 30, 2026/)).toBeTruthy();
    expect(screen.getByText("37/37")).toBeTruthy();
    expect(screen.getByText(/Estimate, not legal advice/)).toBeTruthy();
  });

  it("asks for setup when there are no settings", () => {
    renderHome({ settings: null, summary: null });
    expect(screen.getByText("Set your green card date")).toBeTruthy();
  });

  it("explains an entry flight with no departure", () => {
    renderHome({ notices: [{ kind: "orphan_entry", flightId: "f9", day: "2026-11-02" }] });
    expect(screen.getByText(/You arrived in the US on Nov 2/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/pages/HomePage.test.tsx`
Expected: FAIL — `Failed to resolve import "./HomePage"`.

- [ ] **Step 3: Implement**

`src/components/HeroCard.tsx`:
```tsx
import { addDays, type Day } from "../domain/dates";
import { formatLongDay, formatYMD } from "../ui/format";

export function HeroCard({ greenCardDate, today }: { greenCardDate: Day; today: Day }) {
  const started = today >= greenCardDate;
  return (
    <section className="card card-dark">
      <p className="hero-title">Time as Permanent Resident</p>
      <p className="hero-value">{started ? formatYMD(greenCardDate, addDays(today, 1)) : "Not started yet"}</p>
      <p>{started ? `(since ${formatLongDay(greenCardDate)})` : `(starts ${formatLongDay(greenCardDate)})`}</p>
    </section>
  );
}
```

`src/components/ApplyDateCard.tsx`:
```tsx
import type { Day } from "../domain/dates";
import type { Summary } from "../domain/presence";
import { formatLongDay, formatYMD } from "../ui/format";

function ProgressRing({ progress }: { progress: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${Math.round(progress * 100)}% of required presence`}>
      <circle className="ring-track" cx="44" cy="44" r={r} fill="none" strokeWidth="8" />
      <circle
        className="ring-fill"
        cx="44"
        cy="44"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(progress, 0.02))}
        transform="rotate(-90 44 44)"
      />
    </svg>
  );
}

export function ApplyDateCard({ summary, today }: { summary: Summary; today: Day }) {
  const date = summary.projectedApplyDate;
  return (
    <section className="card card-center">
      <p className="hero-title">You can apply for Citizenship on</p>
      <p className="big-date">{date ? formatLongDay(date) : "Not within the next 10 years"}</p>
      <hr className="divider" />
      <ProgressRing progress={summary.progress} />
      <p className="hero-title">Application countdown</p>
      <p className="hero-value">{date ? formatYMD(today, date) : "—"}</p>
    </section>
  );
}
```

`src/components/StatTile.tsx`:
```tsx
export function StatTile({ icon, value, label, note }: { icon: string; value: string; label: string; note?: string }) {
  return (
    <section className="card tile">
      <div className="tile-icon" aria-hidden="true">
        {icon}
      </div>
      <p className="tile-value">{value}</p>
      <p>{label}</p>
      {note && <p className="tile-note">{note}</p>}
    </section>
  );
}
```

`src/components/StatusCard.tsx`:
```tsx
import { daysBetween } from "../domain/dates";
import type { Summary } from "../domain/presence";
import { formatDayCount, formatLongDay } from "../ui/format";

export function StatusCard({ summary }: { summary: Summary }) {
  const have = formatDayCount(summary.daysInUsSoFar);
  const need = `${summary.requiredMonths} months`;
  if (summary.status === "behind") {
    const late = summary.projectedApplyDate
      ? `${formatLongDay(summary.projectedApplyDate)}, ${daysBetween(summary.earliestFilingDate, summary.projectedApplyDate)} days after the earliest filing date`
      : "not within the next 10 years";
    return (
      <section className="card status status-amber">
        <div>
          <h3>Physical Presence in the USA</h3>
          <p>
            You have <b>{have}</b> of the <b>{need}</b> required. With your logged and planned trips you reach it on {late}.
          </p>
        </div>
      </section>
    );
  }
  const tone = summary.status === "at_risk" ? "status-amber" : "status-green";
  return (
    <section className={`card status ${tone}`}>
      <div>
        <h3>Physical Presence in the USA</h3>
        <p>
          You have <b>{have}</b> of the <b>{need}</b> required to apply for citizenship and are on track. You could spend up to{" "}
          <b>{formatDayCount(Math.max(0, summary.roomLeftDays))}</b> abroad and still meet your target citizenship application date
          (if you also maintain continuous residence).
        </p>
        {summary.status === "at_risk" && <p>One of your trips is long enough to put continuous residence at risk — see below.</p>}
      </div>
    </section>
  );
}
```

`src/components/NoticeCards.tsx`:
```tsx
import { Link } from "react-router-dom";
import type { Absence } from "../domain/types";
import type { Warning } from "../domain/presence";
import type { Notice } from "../sync/flightPairing";
import { formatRange } from "../ui/format";
import { Banner } from "./Banner";

const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const short = (day: string) => SHORT.format(new Date(`${day}T00:00:00Z`));

export function NoticeCards({
  warnings,
  notices,
  absences,
  reviewCount,
}: {
  warnings: Warning[];
  notices: Notice[];
  absences: Absence[];
  reviewCount: number;
}) {
  const byId = new Map(absences.map((a) => [a.id, a]));
  const label = (id: string) => {
    const a = byId.get(id);
    return a ? `${a.name} (${formatRange(a.leave, a.return)})` : "A trip";
  };
  return (
    <>
      {warnings.map((w) =>
        w.kind === "breaks_residence" ? (
          <Banner key={`b${w.absenceId}`} tone="red">
            {label(w.absenceId)} is {w.abroadDays} days abroad. An absence of a year or more breaks continuous residence.
          </Banner>
        ) : w.kind === "presumed_break" ? (
          <Banner key={`p${w.absenceId}`} tone="amber">
            {label(w.absenceId)} is {w.abroadDays} days abroad. Over 6 months, USCIS presumes a break in continuous residence unless you can show otherwise.
          </Banner>
        ) : (
          <Banner key={`r${w.absenceId}`} tone="amber">
            {label(w.absenceId)} has no return logged, so it counts as abroad through today.
          </Banner>
        )
      )}
      {notices.map((n) =>
        n.kind === "orphan_entry" ? (
          <Banner key={`o${n.flightId}`} tone="amber">
            You arrived in the US on {short(n.day)} but no departure is logged. <Link to="/trips">Add the trip</Link>.
          </Banner>
        ) : n.kind === "return_assumed" ? (
          <Banner key={`a${n.flightId}`} tone="amber">
            You left the US again on {short(n.day)} without a logged way back, so the trip before it is assumed to end that day.
          </Banner>
        ) : (
          <Banner key={`u${n.flightId}`} tone="amber">
            A flight's date is uncertain in TravStats — check it so your count stays right.
          </Banner>
        )
      )}
      {reviewCount > 0 && (
        <Banner tone="amber">
          {reviewCount} TravStats {reviewCount === 1 ? "trip needs" : "trips need"} review. <Link to="/trips">Open Trips</Link>.
        </Banner>
      )}
    </>
  );
}
```

`src/components/NextTripCard.tsx`:
```tsx
import type { NextTrip } from "../domain/presence";
import { tripName } from "../sync/reconcile";

export function NextTripCard({ trip }: { trip: NextTrip }) {
  const name = trip.absence.countries.length ? tripName(trip.absence.countries) : trip.absence.name;
  return (
    <section className="card row-card">
      <span className="row-icon" aria-hidden="true">
        🗓️
      </span>
      <div>
        <h3>
          Your {name} trip is in {trip.daysUntil} {trip.daysUntil === 1 ? "day" : "days"}
        </h3>
        <p>
          Departs in <b>{trip.daysUntil}</b> days - <b>{trip.abroadDays} days</b> abroad
        </p>
      </div>
    </section>
  );
}
```

`src/components/TripsThatCount.tsx`:
```tsx
import type { CountedTrip } from "../domain/presence";
import { tripName } from "../sync/reconcile";
import { formatRange } from "../ui/format";

export function TripsThatCount({ trips }: { trips: CountedTrip[] }) {
  return (
    <section className="card row-card">
      <span className="row-icon" aria-hidden="true">
        🕒
      </span>
      <div>
        <h3>Trips that count when applying for citizenship</h3>
        {trips.length === 0 && <p>No trips yet.</p>}
        {trips.map(({ absence, calendarDays, abroadDays }) => (
          <p key={absence.id}>
            <b>{absence.countries.length ? tripName(absence.countries) : absence.name}</b>: {formatRange(absence.leave, absence.return)},{" "}
            <b>{calendarDays} days</b> trip ({abroadDays} USCIS days)
          </p>
        ))}
      </div>
    </section>
  );
}
```

`src/components/YearBars.tsx`:
```tsx
import type { YearBar } from "../domain/presence";

export function YearBars({ bars }: { bars: YearBar[] }) {
  return (
    <section className="card row-card">
      <span className="row-icon" aria-hidden="true">
        📅
      </span>
      <div style={{ flex: 1 }}>
        <h3>Days in USA by Year</h3>
        {bars.map((b) => (
          <div key={b.year} className="year-row">
            <span className="muted">{b.year}</span>
            <div className="year-bar">
              <div className="year-fill" style={{ width: `${(b.present / b.elapsed) * 100}%` }} />
              <span className="year-label">
                {b.present}/{b.elapsed}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

`src/pages/HomePage.tsx`:
```tsx
import { Link } from "react-router-dom";
import { ApplyDateCard } from "../components/ApplyDateCard";
import { Banner } from "../components/Banner";
import { HeroCard } from "../components/HeroCard";
import { NextTripCard } from "../components/NextTripCard";
import { NoticeCards } from "../components/NoticeCards";
import { StatTile } from "../components/StatTile";
import { StatusCard } from "../components/StatusCard";
import { TripsThatCount } from "../components/TripsThatCount";
import { YearBars } from "../components/YearBars";
import { flagEmoji } from "../domain/countries";
import type { TravelData } from "../state/loadTravelData";
import { formatDayCount, greetingFor } from "../ui/format";

export function HomePage({ data, hour = new Date().getHours() }: { data: TravelData; hour?: number }) {
  const { summary, settings, user, today, classification, notices, syncError } = data;
  const name = settings?.displayName || user.firstName || user.username;
  return (
    <div className="stack">
      <header className="greeting">
        <span className="logo" aria-hidden="true">
          🌎
        </span>
        <h1>
          {greetingFor(hour)}, {name}
        </h1>
      </header>
      {syncError && <Banner tone="amber">Couldn't finish syncing with TravStats: {syncError}</Banner>}
      {!settings || !summary ? (
        <section className="card stack">
          <h3>Set your green card date</h3>
          <p className="muted">Everything here counts from the day you became a permanent resident.</p>
          <Link className="button primary" to="/settings" style={{ textAlign: "center", textDecoration: "none" }}>
            Open Settings
          </Link>
        </section>
      ) : (
        <>
          <HeroCard greenCardDate={settings.greenCardDate} today={today} />
          <ApplyDateCard summary={summary} today={today} />
          <div className="tiles">
            <StatTile icon={flagEmoji("US")} value={formatDayCount(summary.daysInUsSoFar)} label="In USA" note={`(${summary.requiredMonths} months required)`} />
            <StatTile icon="✈️" value={formatDayCount(summary.daysAbroadSoFar)} label="Abroad" />
          </div>
          <h2>Must-know for Citizenship</h2>
          <StatusCard summary={summary} />
          <NoticeCards warnings={summary.warnings} notices={notices} absences={classification.absences} reviewCount={classification.review.length} />
          <h2>Your journey in numbers</h2>
          {summary.nextTrip && <NextTripCard trip={summary.nextTrip} />}
          <TripsThatCount trips={summary.tripsThatCount} />
          <YearBars bars={summary.yearBars} />
        </>
      )}
      <footer className="fineprint">
        Estimate, not legal advice. Rules from the USCIS Policy Manual,{" "}
        <a href="https://www.uscis.gov/policy-manual/volume-12-part-d-chapter-4" target="_blank" rel="noreferrer">
          Vol. 12 Part D Ch. 4
        </a>{" "}
        and{" "}
        <a href="https://www.uscis.gov/policy-manual/volume-12-part-g" target="_blank" rel="noreferrer">
          Part G
        </a>
        .
      </footer>
    </div>
  );
}
```

In `src/App.tsx`: add `import { HomePage } from "./pages/HomePage";`, and replace the `/` route element with `<HomePage data={state.data} />`.

- [ ] **Step 4: Run it to see it pass, and check the links**

Run: `npx vitest --run src/pages/HomePage.test.tsx && npm run typecheck`
Expected: PASS (3 tests), with no type errors.

Run: `curl -s -o /dev/null -w '%{http_code}\n' https://www.uscis.gov/policy-manual/volume-12-part-d-chapter-4 https://www.uscis.gov/policy-manual/volume-12-part-g`
Expected: `200` for both. If either is not 200, look up the current URL on uscis.gov and update the `href`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HomePage.tsx src/pages/HomePage.test.tsx src/components src/App.tsx
git commit -m "feat(ui): home dashboard matching the reference screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Trips page and Add/Edit sheet

**Files:**
- Create: `src/pages/TripsPage.tsx`, `src/components/TripSheet.tsx`, `src/components/TripRow.tsx`
- Modify: `src/App.tsx` (the `/trips` route)
- Test: `src/components/TripSheet.test.ts`

**Interfaces:**
- Consumes: `TravelData` (Task 8); `TravStatsApi`, `TripInput` (Task 7); `Absence`, `TripRecord` (Task 3); `abroadDays` (Task 3); `PICKER_COUNTRIES`, `flagEmoji` (Task 4); `TAG_ABSENCE`, `TAG_IGNORED`, `TAG_AUTO` (Task 4); `tripName` (Task 6); `isDay` (Task 2); `isUsJurisdiction` (Task 3); `formatRange` (Task 9); `Banner` (Task 9).
- Produces: `TripForm { countries: string[]; leave: string; ret: string }`; `validateTripForm(form): string | null`; `toTripInput(form, existingTags): TripInput`; `ignoreTags(existingTags): string[]`; `<TripSheet>`; `<TripRow>`; `<TripsPage data api onChanged />`.

- [ ] **Step 1: Write the failing test** — `src/components/TripSheet.test.ts`

```ts
import { ignoreTags, toTripInput, validateTripForm } from "./TripSheet";

describe("trip form", () => {
  const ok = { countries: ["CA"], leave: "2026-10-23", ret: "2026-10-30" };

  it("accepts a normal trip and an open one", () => {
    expect(validateTripForm(ok)).toBeNull();
    expect(validateTripForm({ ...ok, ret: "" })).toBeNull();
  });
  it("requires a country and a departure date", () => {
    expect(validateTripForm({ ...ok, countries: [] })).toBe("Choose a country.");
    expect(validateTripForm({ ...ok, leave: "" })).toBe("Enter the departure date.");
  });
  it("refuses US states and territories", () => {
    expect(validateTripForm({ ...ok, countries: ["PR"] })).toBe("Time in the US or a US territory isn't an absence.");
  });
  it("refuses a return before the departure", () => {
    expect(validateTripForm({ ...ok, ret: "2026-10-22" })).toBe("The return date can't be before the departure date.");
  });
  it("builds the TravStats trip, dropping auto so flights never overwrite an edit", () => {
    expect(toTripInput(ok, ["us-absence", "auto", "family"])).toEqual({
      name: "Canada",
      countries: ["CA"],
      startDate: "2026-10-23",
      endDate: "2026-10-30",
      tags: ["us-absence", "family"],
    });
    expect(toTripInput({ ...ok, ret: "" }, []).endDate).toBeNull();
    expect(toTripInput(ok, []).tags).toEqual(["us-absence"]);
  });
  it("ignores a flight-made trip instead of deleting it", () => {
    expect(ignoreTags(["us-absence", "auto"])).toEqual(["auto", "us-absence-ignored"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest --run src/components/TripSheet.test.ts`
Expected: FAIL — `Failed to resolve import "./TripSheet"`.

- [ ] **Step 3: Implement**

`src/components/TripSheet.tsx`:
```tsx
import { useState, type FormEvent } from "react";
import type { TripInput } from "../api/travstats";
import { TAG_ABSENCE, TAG_AUTO, TAG_IGNORED } from "../domain/absences";
import { PICKER_COUNTRIES } from "../domain/countries";
import { isDay } from "../domain/dates";
import { isUsJurisdiction } from "../domain/rules";
import type { Absence } from "../domain/types";
import { tripName } from "../sync/reconcile";
import { Banner } from "./Banner";

export interface TripForm {
  countries: string[];
  leave: string;
  ret: string;
}

export function validateTripForm(form: TripForm): string | null {
  if (form.countries.length === 0) return "Choose a country.";
  if (form.countries.some(isUsJurisdiction)) return "Time in the US or a US territory isn't an absence.";
  if (!isDay(form.leave)) return "Enter the departure date.";
  if (form.ret && !isDay(form.ret)) return "Enter a valid return date.";
  if (form.ret && form.ret < form.leave) return "The return date can't be before the departure date.";
  return null;
}

export function toTripInput(form: TripForm, existingTags: string[]): TripInput {
  const kept = existingTags.filter((t) => t !== TAG_AUTO && t !== TAG_ABSENCE);
  return {
    name: tripName(form.countries),
    countries: form.countries,
    startDate: form.leave,
    endDate: form.ret || null,
    tags: [TAG_ABSENCE, ...kept],
  };
}

/** A flight-made trip is never deleted: its flights would recreate it. */
export function ignoreTags(existingTags: string[]): string[] {
  return [...existingTags.filter((t) => t !== TAG_ABSENCE), TAG_IGNORED];
}

export function TripSheet({
  initial,
  greenCardDate,
  onSave,
  onRemove,
  onClose,
}: {
  initial: Absence | null;
  greenCardDate: string | null;
  onSave: (form: TripForm) => Promise<void>;
  onRemove?: () => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TripForm>({
    countries: initial?.countries ?? [],
    leave: initial?.leave ?? "",
    ret: initial?.return ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const removeLabel = initial?.source === "auto" ? "Don't count this trip" : "Delete trip";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateTripForm(form);
    if (problem) setError(problem);
    else void run(() => onSave(form));
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="sheet-head">
          <h1>{initial ? "Edit Trip" : "Add Trip"}</h1>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {error && <Banner tone="red">{error}</Banner>}
        <label className="field">
          Country
          <select
            value={form.countries.length === 1 ? form.countries[0] : ""}
            onChange={(e) => setForm({ ...form, countries: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">{form.countries.length > 1 ? tripName(form.countries) : "Select country"}</option>
            {PICKER_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Departure Date
          <input type="date" value={form.leave} onChange={(e) => setForm({ ...form, leave: e.target.value })} />
        </label>
        <label className="field">
          Return Date (leave empty if you haven't come back yet)
          <input type="date" value={form.ret} min={form.leave || undefined} onChange={(e) => setForm({ ...form, ret: e.target.value })} />
        </label>
        {greenCardDate && form.leave && form.leave < greenCardDate && (
          <p className="muted">This trip starts before your green card date; only the days after it affect your count.</p>
        )}
        <button className="button primary" disabled={busy}>
          Save Trip
        </button>
        {onRemove && (
          <button type="button" className="button ghost" disabled={busy} onClick={() => void run(onRemove)}>
            {removeLabel}
          </button>
        )}
      </form>
    </div>
  );
}
```

`src/components/TripRow.tsx`:
```tsx
import { flagEmoji } from "../domain/countries";
import { abroadDays } from "../domain/presence";
import type { Absence } from "../domain/types";
import { tripName } from "../sync/reconcile";
import { formatRange } from "../ui/format";

export function TripRow({ absence, today, onClick }: { absence: Absence; today: string; onClick: () => void }) {
  const days = abroadDays(absence, today);
  return (
    <button type="button" className="card trip-row" onClick={onClick}>
      <span className="flag" aria-hidden="true">
        {flagEmoji(absence.countries[0] ?? "")}
      </span>
      <span className="grow">
        <h3>{absence.countries.length ? tripName(absence.countries) : absence.name}</h3>
        <span className="muted">{formatRange(absence.leave, absence.return)}</span>
        {absence.leave > today && <span className="badge">planned</span>}
        {absence.source === "auto" && <span className="badge">from flights</span>}
        {absence.return === null && <span className="badge">return not logged</span>}
      </span>
      <span className="days">
        {days} {days === 1 ? "day" : "days"}
      </span>
    </button>
  );
}
```

`src/pages/TripsPage.tsx`:
```tsx
import { useState } from "react";
import type { TravStatsApi } from "../api/travstats";
import { Banner } from "../components/Banner";
import { TripRow } from "../components/TripRow";
import { TripSheet, ignoreTags, toTripInput, type TripForm } from "../components/TripSheet";
import { TAG_ABSENCE, TAG_IGNORED } from "../domain/absences";
import type { Absence } from "../domain/types";
import type { TravelData } from "../state/loadTravelData";
import { formatRange } from "../ui/format";

export function TripsPage({ data, api, onChanged }: { data: TravelData; api: TravStatsApi; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<Absence | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tagsOf = (id: string) => data.trips.find((t) => t.id === id)?.tags ?? [];
  const absences = [...data.classification.absences].sort((a, b) => (a.leave < b.leave ? 1 : -1));

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function save(form: TripForm) {
    if (editing === "new") await api.createTrip(toTripInput(form, []));
    else if (editing) await api.updateTrip(editing.id, toTripInput(form, tagsOf(editing.id)));
    setEditing(null);
    await onChanged();
  }

  async function remove() {
    if (!editing || editing === "new") return;
    if (editing.source === "auto") await api.updateTrip(editing.id, { tags: ignoreTags(tagsOf(editing.id)) });
    else await api.deleteTrip(editing.id);
    setEditing(null);
    await onChanged();
  }

  return (
    <div className="stack">
      <div className="trips-header">
        <div className="segmented">
          <button type="button" className="seg active">
            Trips
          </button>
          <button type="button" className="seg" disabled title="Coming soon">
            What if?
          </button>
        </div>
        <button type="button" className="fab" aria-label="Add trip" onClick={() => setEditing("new")}>
          +
        </button>
      </div>
      {error && <Banner tone="red">{error}</Banner>}
      {absences.length === 0 && <p className="muted center">No trips yet. Tap + to add one.</p>}
      {absences.map((a) => (
        <TripRow key={a.id} absence={a} today={data.today} onClick={() => setEditing(a)} />
      ))}
      {data.classification.review.length > 0 && (
        <section className="stack">
          <h2>Needs review</h2>
          <p className="muted">These TravStats trips might include time outside the US.</p>
          {data.classification.review.map((t) => (
            <div key={t.id} className="card stack">
              <b>{t.name}</b>
              <span className="muted">
                {t.startDay ? formatRange(t.startDay, t.endDay) : "No dates"} · {t.countries.join(", ") || "no countries"}
              </span>
              <div className="trips-header">
                <button type="button" className="button primary" onClick={() => void act(() => api.updateTrip(t.id, { tags: [...t.tags, TAG_ABSENCE] }))}>
                  Count
                </button>
                <button type="button" className="button ghost" onClick={() => void act(() => api.updateTrip(t.id, { tags: [...t.tags, TAG_IGNORED] }))}>
                  Ignore
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      {editing && (
        <TripSheet
          initial={editing === "new" ? null : editing}
          greenCardDate={data.settings?.greenCardDate ?? null}
          onSave={save}
          onRemove={editing === "new" ? undefined : remove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
```

In `src/App.tsx`: add `import { TripsPage } from "./pages/TripsPage";`, and replace the `/trips` route element with `<TripsPage data={state.data} api={api} onChanged={refresh} />`.

- [ ] **Step 4: Run all tests and the build**

Run: `npx vitest --run src/components/TripSheet.test.ts && npm test && npm run build`
Expected: TripSheet passes (6 tests), the whole suite passes, and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/TripsPage.tsx src/components/TripSheet.tsx src/components/TripSheet.test.ts src/components/TripRow.tsx src/App.tsx
git commit -m "feat(ui): trips list, review queue, add/edit sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 13: Container image with the same-origin proxy

**Files:**
- Create: `deploy/Dockerfile`, `deploy/nginx.conf`, `deploy/compose.yml`, `.dockerignore`
- Modify: `README.md` (add a Deploy section)

**Interfaces:**
- Consumes: `npm run build` (Task 1).
- Produces: image `citizenship-tracker:local`, which serves the SPA on :80 and proxies `/api/v1/` to `http://travstats-app:80`.

- [ ] **Step 1: Write the files**

`deploy/Dockerfile`:
```dockerfile
FROM node:22.11-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

`deploy/nginx.conf`:
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;

  # Same origin as the app, so TravStats' host-only SameSite=Strict cookie works.
  location /api/v1/ {
    proxy_pass http://travstats-app:80;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
  }

  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location / {
    add_header Cache-Control "no-cache";
    try_files $uri /index.html;
  }
}
```

`deploy/compose.yml`:
```yaml
services:
  citizenship:
    build:
      context: ..
      dockerfile: deploy/Dockerfile
    image: citizenship-tracker:local
    container_name: citizenship-tracker
    restart: unless-stopped
    ports:
      - "127.0.0.1:8611:80"
    networks:
      - travstats
    security_opt:
      - no-new-privileges:true

networks:
  travstats:
    external: true
    name: travstats_travstats-network
```

`.dockerignore`:
```
node_modules
dist
.git
```

Append to `README.md`:
```markdown
## Deploy

The container joins TravStats' Docker network and proxies `/api/v1` to
`travstats-app`, so you sign in with your TravStats account.

    docker compose -f deploy/compose.yml up -d --build   # http://127.0.0.1:8611

Point the tunnel hostname at `http://localhost:8611` and put a Cloudflare
Access policy on it. Add this container's network (`192.168.80.0/20`) to
TravStats' `TRUST_PROXY` so login rate limits stay per visitor.
```

- [ ] **Step 2: Build and run it locally**

Run: `cd /home/ohmz/StudioProjects/citizenship-tracker && docker compose -f deploy/compose.yml up -d --build`
Expected: the container `citizenship-tracker` is running.

Run: `curl -s http://127.0.0.1:8611/api/v1/version && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8611/trips`
Expected: TravStats version JSON from the proxy, then `200` (the SPA fallback).

- [ ] **Step 3: Commit**

```bash
git add deploy .dockerignore README.md
git commit -m "build: nginx image proxying /api/v1 to TravStats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 14: Switch TravStats to the fork's `main` build (Phase 0) — owner approval required

This changes a running service. **Stop and ask the owner before Step 2.**

**Files:**
- Modify: `/home/ohmz/StudioProjects/travstats/docker-compose.yml` (the `app.image` line)
- Modify: `/home/ohmz/StudioProjects/travstats/README.md` (the "Image version" section)

- [ ] **Step 1: Build the fork image**

Run: `cd /home/ohmz/StudioProjects/TravStats-fork && git fetch upstream && git merge --ff-only upstream/main && docker build -t travstats-fork:main .`
Expected: the image builds. (`main` has only upstream commits, so the fast-forward is clean.)

- [ ] **Step 2: Back up, then ask the owner**

Run: `docker exec travstats-db pg_dump -U flights flights | zstd > /home/ohmz/StudioProjects/travstats/pre-fork-$(date +%Y%m%d).sql.zst`
Expected: a non-empty dump file.
Then ask the owner: "Switch TravStats from the 2.6.3 image to `travstats-fork:main` now?" Continue only on an explicit yes.

- [ ] **Step 3: Swap the image and restart**

In `docker-compose.yml`, change `image: ghcr.io/abrechen2/travstats:${TRAVSTATS_VERSION:-1.2.1}` to `image: travstats-fork:main`. In the README's "Image version" section, add a note that the app now runs the fork's build from `github.com/ohmzi/TravStats` (`main`), rebuilt with `docker build -t travstats-fork:main .` in the fork.

Run: `cd /home/ohmz/StudioProjects/travstats && docker compose up -d && sleep 60 && docker ps --filter name=travstats-app --format '{{.Status}}' && curl -s http://127.0.0.1:8610/api/v1/version`
Expected: `Up … (healthy)`, and a version reporting the 2.7 line.

- [ ] **Step 4: Confirm the API shapes the app relies on**

Sign in through the citizenship app (Task 13's container) and add one trip. Then run:
`curl -s -b <cookie> http://127.0.0.1:8611/api/v1/trips | head -c 600`
Expected: each trip carries `tags`, `countries` and `times.start.date`. Do the same for `/api/v1/flights?all=true` once a flight exists: each flight has `depCountry` and `times.departure.local`.

---

### Task 15: End-to-end check and go-live — owner approval for public exposure

- [ ] **Step 1: Walk through the reference scenario**

At http://127.0.0.1:8611:
1. Sign in with TravStats.
2. Settings: green card date 2026-09-01, 3-year path.
3. Add Canada, Oct 23 – Oct 30, 2026.

Expected on Home: apply date "June 3, 2029", "Your Canada trip is in N days", "8 days trip (6 USCIS days)". The same trip appears in TravStats' Trips page, tagged `us-absence`.

- [ ] **Step 2: Flight sync**

In TravStats, log a scheduled flight JFK→YYZ on 2026-12-20 and YYZ→JFK on 2026-12-27. Reload the citizenship app.
Expected: a "Canada" trip appears with the "from flights" badge, and TravStats shows both flights inside that trip. Reloading again changes nothing.
Then open the trip and choose "Don't count this trip". Reload.
Expected: the trip is gone from the list and does not come back.

- [ ] **Step 3: Ask the owner before exposing it**

Ask: "Ready to point `citizenship.ohmzhomelab.ca` at `http://localhost:8611` with a Cloudflare Access policy, and to add `192.168.80.0/20` to TravStats' `TRUST_PROXY`?" The owner makes the tunnel and Access changes. The `TRUST_PROXY` edit in `/home/ohmz/StudioProjects/travstats/.env` and the restart happen only after an explicit yes.
