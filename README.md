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

## Deploy

The container joins TravStats' Docker network and proxies `/api/v1` to
`travstats-app`, so you sign in with your TravStats account.

    docker compose -f deploy/compose.yml up -d --build   # http://127.0.0.1:8611

Point the tunnel hostname at `http://localhost:8611` and put a Cloudflare
Access policy on it. Add this container's network (`192.168.80.0/20`) to
TravStats' `TRUST_PROXY` so login rate limits stay per visitor.
