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
