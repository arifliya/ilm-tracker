import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

// E2E_BASE_URL (from e2e/.env — written either by hand locally, or by
// .github/workflows/e2e-remote.yml from a GitHub secret when run there)
// points the suite at an already-running environment instead of the local
// one scripts/run-e2e.sh starts itself. See .env.example for the full
// explanation and the "never point this at production" warning.
const baseURL = process.env.E2E_BASE_URL || "http://localhost:5173";

// Only set when targeting staging (e2e/.env.example) — lets this suite's
// own login attempts skip staging's login rate limiter (see backend's
// rateLimit.ts) without loosening it for anyone else. Never set locally
// or against production, so this header is simply absent/harmless there.
const bypassToken = process.env.E2E_BYPASS_TOKEN;

export default defineConfig({
  testDir: "./tests",
  // Run journeys one at a time in a visible browser window rather than
  // several in parallel — the point of headed mode here is to actually
  // watch each journey happen, which several simultaneous windows would
  // defeat. CI has no display server and nobody's watching, so it runs
  // headless instead — same serial, one-journey-at-a-time execution
  // either way, just without a visible window.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : [["html", { open: "never" }]],
  use: {
    baseURL,
    headless: !!process.env.CI,
    trace: "on-first-retry",
    ...(bypassToken ? { extraHTTPHeaders: { "X-E2E-Bypass-Token": bypassToken } } : {})
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
