#!/usr/bin/env sh
# Runs the Playwright E2E suite against a fully isolated stack.
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
# down` (not just stop) on your regular dev stack first if it's up.
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

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example to .env first." >&2
  exit 1
fi

PROJECT=ilm-e2e

# The backend's login/registration/change-password rate limiters skip
# themselves under NODE_ENV=test (see backend/src/routes/auth.ts's
# isTestEnv()) — already how the Jest suite avoids them. An E2E run logs
# in far more than 10 times (the login limiter's threshold) in well under
# its 15-minute window, so it needs the same exemption. docker-compose.yml
# only applies this when NODE_ENV is set, so the regular dev/prod stack is
# unaffected.
export NODE_ENV=test

cleanup() {
  docker compose -p "$PROJECT" down -v
}
trap cleanup EXIT

docker compose -p "$PROJECT" down -v --remove-orphans
docker compose -p "$PROJECT" up -d --build --wait

./scripts/seed-db.sh

npm --prefix e2e run "$TEST_SCRIPT"
