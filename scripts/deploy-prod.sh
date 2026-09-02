#!/usr/bin/env sh
# Always applies the production overlay together with the base compose
# file, so the two `-f` flags documented in the README can never be
# forgotten (docker-compose.prod.yml is not a standalone file — applied on
# its own, docker compose ignores it and the DB port stays published).
#
# Usage: same as `docker compose`, e.g.:
#   ./scripts/deploy-prod.sh up -d --build
#   ./scripts/deploy-prod.sh down
#   ./scripts/deploy-prod.sh run --rm liquibase status --verbose
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.production.example to .env and fill in real secrets first." >&2
  exit 1
fi

docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"
