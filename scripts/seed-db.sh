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

docker exec -i ilm_db mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < mysql/seed.sql
echo "Seed data loaded."
