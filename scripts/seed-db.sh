#!/usr/bin/env sh
# Loads mysql/seed.sql (demo data) into the running dev database.
#
# This is intentionally separate from Liquibase: Liquibase (liquibase/changelog/)
# owns schema changes only, so a schema release can never accidentally insert
# or overwrite data. Run this manually, only in dev, only after the schema
# is up to date (i.e. after `docker compose up` / the liquibase service has run).
set -eu

cd "$(dirname "$0")/.."
set -a
. ./.env
set +a

# -e forwards PGPASSWORD into the container's exec environment — `docker
# exec` doesn't inherit the host shell's env by default, so setting
# PGPASSWORD on this command line alone would only be visible to the
# `docker` client process, not to psql running inside the container.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i ilm_db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < mysql/seed.sql
echo "Seed data loaded."
