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
