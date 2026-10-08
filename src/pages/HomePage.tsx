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
