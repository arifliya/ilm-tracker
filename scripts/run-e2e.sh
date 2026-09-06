#!/usr/bin/env sh
# Runs the Playwright E2E suite — either against a fully isolated local
# stack it brings up itself (the default), or against an already-running
# remote environment (staging) when e2e/.env sets E2E_BASE_URL, per
# e2e/.env.example. One command brings up everything a local run needs and
# tears it all back down again, pass or fail; nothing needs to be started
# by hand in another terminal first.
#
# Uses its own Compose project name (-p ilm-e2e) so it gets its own volume
# namespace, separate from the volume your regular `docker compose up` dev
# stack uses — running this never touches your normal dev database. Always
# tears the stack down and wipes its volume first (fresh schema + seed data
# every run, so re-running the seed SQL never produces duplicate rows) and
# again on exit via the trap below, pass or fail.
#
# docker-compose.yml's services have fixed container_names, so this only
# isolates *volumes*, not container names — a stopped-but-not-removed dev
# container still reserves its name and will collide. Run `docker compose
# down` (not just stop) on your regular dev stack first if it's up — same
# goes for `wrangler dev`/`vite dev` already running in another terminal,
# since this script binds the same ports (8787/5173) they use.
#
# By default, skips journeys tagged @flagged — those depend on a feature
# flag that's off by default on real deployments, and are opt-in so a
# routine run stays fast. Pass --all to include them.
#
# Usage: ./scripts/run-e2e.sh [--all]
set -eu

cd "$(dirname "$0")/.."

TEST_SCRIPT=test:core
if [ "${1:-}" = "--all" ]; then
  TEST_SCRIPT=test
fi

# Required unconditionally, local or remote — it's the only place
# E2E_SEED_PASSWORD ever comes from (helpers/auth.ts has no hardcoded
# fallback), so without it every login-dependent journey fails at the
# very first step, local run or not.
if [ ! -f e2e/.env ]; then
  echo "Missing e2e/.env — copy e2e/.env.example to e2e/.env first." >&2
  exit 1
fi

# Read E2E_BASE_URL out of e2e/.env without sourcing the whole file (it may
# gain other keys later, and sourcing would leak any of those into this
# script's own env too, which we don't want) — the well-formed line is all
# we need. Also honors an already-exported E2E_BASE_URL (how
# .github/workflows/e2e-remote.yml's own e2e/.env gets picked up, since it
# writes the same file rather than exporting directly — see that workflow).
E2E_BASE_URL="${E2E_BASE_URL:-}"
if [ -z "$E2E_BASE_URL" ] && [ -f e2e/.env ]; then
  E2E_BASE_URL=$(grep -m1 '^E2E_BASE_URL=' e2e/.env | cut -d= -f2- || true)
fi

if [ -n "$E2E_BASE_URL" ]; then
  echo "E2E_BASE_URL is set ($E2E_BASE_URL) — running against that environment directly, not starting anything locally."
  echo "The target environment must already be seeded (see e2e/.env.example) — this script does not seed a remote database."
  npm --prefix e2e run "$TEST_SCRIPT"
  exit 0
fi

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example to .env first." >&2
  exit 1
fi

if [ ! -f backend/.dev.vars ]; then
  echo "Missing backend/.dev.vars — copy backend/.dev.vars.example to backend/.dev.vars first." >&2
  exit 1
fi

PROJECT=ilm-e2e

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  # Killing the process directly (not a wrapper like `npm run dev`, or even
  # `npx`) is why the servers are invoked via `exec` against their real
  # node_modules/.bin/ path below rather than through `npx` — npx forks a
  # child for the actual binary instead of exec-ing into it, so `exec npx
  # wrangler dev`'s $! is npx's own PID, not wrangler's; killing that left
  # the real wrangler/vite process orphaned and still bound to its port,
  # breaking every run after the first. Invoking the binary directly makes
  # `exec` a true replacement, so $! is the real process and this actually
  # stops it.
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  docker compose -p "$PROJECT" down -v
}
trap cleanup EXIT

docker compose -p "$PROJECT" down -v --remove-orphans
docker compose -p "$PROJECT" up -d --build --wait

# --wait only waits for db/wsproxy's own healthchecks — liquibase has none
# (it's a one-shot migration job, not a long-running service), and nothing
# else in docker-compose.yml declares a `depends_on: condition:
# service_completed_successfully` on it, so `up --wait` returns as soon as
# its container has *started*, not once `liquibase update` has actually
# finished creating the schema. Without this, seed-db.sh below races it —
# every INSERT fails with "relation ... does not exist" if seeding wins,
# silently (psql keeps going past per-statement errors and still exits 0),
# so nothing looks wrong until every login in the suite fails with a clean
# "Invalid credentials" against tables that were still empty at seed time.
docker compose -p "$PROJECT" wait liquibase

./scripts/seed-db.sh

# Waits for a URL to answer rather than a fixed sleep, since startup time
# varies (cold npm/esbuild caches in CI vs. a warm local machine).
wait_for() {
  url="$1"
  name="$2"
  i=0
  while ! curl -sf -m 2 "$url" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then
      echo "$name did not become ready at $url within 60s" >&2
      exit 1
    fi
    sleep 1
  done
}

# --var NODE_ENV:test overrides wrangler.toml's [vars] NODE_ENV (normally
# "production") for just this run — that's what utils/rateLimit.ts's
# checkRateLimit() checks (c.env.NODE_ENV === "test") to skip the login/
# registration/change-password rate limiters, which an E2E run blows
# through in minutes (the login limiter alone is 10 requests/15 min, and
# the full suite logs in far more than that). A shell-exported NODE_ENV
# would NOT reach this check — wrangler dev's Worker runs in its own
# sandboxed process with its own c.env, entirely separate from this
# script's own Node process env, so only an explicit --var/.dev.vars
# entry actually crosses that boundary. Scoped to this one invocation, not
# committed anywhere, so a routine `npm run dev` still enforces real limits.
(cd backend && exec ./node_modules/.bin/wrangler dev --var NODE_ENV:test >../backend-dev.log 2>&1) &
BACKEND_PID=$!
wait_for http://localhost:8787/healthz "Backend (wrangler dev)"

(cd frontend && exec ./node_modules/.bin/vite >../frontend-dev.log 2>&1) &
FRONTEND_PID=$!
wait_for http://localhost:5173 "Frontend (vite dev)"

npm --prefix e2e run "$TEST_SCRIPT"
