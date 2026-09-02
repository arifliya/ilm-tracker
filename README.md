# ilm-school-portal

A multi-tenant school management portal: parents, teachers, and school
staff each get a role-scoped dashboard for attendance, tasks,
notifications, and student notes, with a platform-level `system_admin`
role for onboarding new schools and managing feature rollout.

## Stack

- **Backend** (`backend/`) — Express + TypeScript API, MySQL
  (`mysql2`), JWT session cookies. See [`backend/README.md`](backend/README.md).
- **Frontend** (`frontend/`) — React + TypeScript SPA (Vite), served by
  nginx in production. See [`frontend/README.md`](frontend/README.md).
- **Database** — MySQL, schema managed by Liquibase (below).
- **Orchestration** — `docker-compose.yml` runs MySQL, a one-shot
  Liquibase migration step, the backend, and the frontend together.

## Roles

`system_admin` (platform-wide, not tied to a school) → `owner` →
`admin`/`maintainer` → `teacher`/`staff` → `parent` → `student`, plus a
`pending` state for newly registered users awaiting approval. Each school
is an isolated tenant: staff and parents register into a school using a
school code (and, for parents, a class code per child), and
`system_admin` is the only role that can see or act across schools.

## Running it locally

```
cp .env.example .env    # fill in real secrets, see inline comments
docker compose up -d --build
```

This brings up MySQL, applies pending Liquibase migrations, then starts
the backend (`http://localhost:4000`) and frontend
(`http://localhost:5173`). Load demo data once the stack is healthy with
`./scripts/seed-db.sh`. For day-to-day backend/frontend development
(hot reload, running each independently) see their own READMEs linked
above.

## Environments: dev vs. production

The base `docker-compose.yml` is dev-shaped on purpose — it publishes
MySQL's port to the host so you can connect a local DB client directly,
and the `.env.example` files default to insecure placeholder values
(`COOKIE_SECURE=false`, `CORS_ORIGIN=http://localhost:5173`, etc.) that
are correct for local dev and wrong for anything reachable over the
internet.

For a real deployment:

```
cp .env.production.example .env
cp backend/.env.production.example backend/.env
# fill in real secrets — see the comments in each file, every value
# marked "changeme" must actually change
./scripts/deploy-prod.sh up -d --build
```

`docker-compose.prod.yml` is an overlay (not a standalone file — it does
nothing applied on its own) that stops MySQL's port from being published
to the host, since in production the database should only be reachable
from other containers on the compose network.
`./scripts/deploy-prod.sh` always applies it together with the base file
(equivalent to `docker compose -f docker-compose.yml -f
docker-compose.prod.yml`, passing through whatever arguments you give it —
`up -d --build`, `down`, `run --rm liquibase status`, ...) so the overlay
can't be forgotten by typing the plain `docker compose` command out of
habit. The `.env.production.example` files call out every value that must differ
from the dev defaults — most importantly `COOKIE_SECURE=true` and a real
`CORS_ORIGIN`, without which sessions either won't be sent over HTTPS or
will be rejected by the browser entirely. Requires Docker Compose v2.24+
(for the `!override` merge tag the overlay relies on to actually replace
the base file's port publish, rather than just appending to it) — check
with `docker compose version`.

This repo has no reverse proxy or TLS termination of its own — that (and
a database backup strategy) is expected to live at whatever layer
actually terminates HTTPS in front of these containers.

For the full operational sequence — routine deploys, applying/rolling back
migrations, rotating secrets, and troubleshooting — see
[`DEPLOY_RUNBOOK.md`](DEPLOY_RUNBOOK.md).

## API documentation

`backend/openapi.yaml` is an OpenAPI 3.0 spec covering every route —
request/response shapes, auth requirements, feature-flag gating, rate
limits, and session/cookie behavior are all documented at the top of the
file. View it with any OpenAPI tool, e.g. paste it into
https://editor.swagger.io, or generate a browsable HTML page locally:

```
npx @redocly/cli build-docs backend/openapi.yaml -o api-docs.html
```

Keep it in sync when a route changes — there's no generator wired up yet,
so it's maintained by hand alongside the route files.

## Database migrations (Liquibase)

Schema changes are managed by Liquibase, not by hand-editing a bootstrap
SQL file. `docker compose up` runs a one-shot `liquibase` service that
applies any changesets in `liquibase/changelog/` that haven't run yet
against the `db` service, before `backend` starts. It only ever touches
schema — it never inserts, updates, or deletes application data.

- **Adding a schema change**: create a new file
  `liquibase/changelog/NNN-short-description.sql` (next number after the
  highest one present), using the same `--liquibase formatted sql` /
  `--changeset author:id` header style as `001-baseline-schema.sql`, then
  add an `<include file="changelog/NNN-short-description.sql" .../>` line
  to `changelog-master.xml`. Prefer additive, non-destructive changes
  (`ADD COLUMN`, `CREATE TABLE`, new indexes); never edit a changeset that
  has already run anywhere — Liquibase checksums each one and will refuse
  to reapply a modified file.
- **Never delete/rewrite a changeset** once it has run in any shared
  environment. If a change needs undoing, write a new changeset that
  reverses it.
- **Applying migrations without a full restart**:
  `docker compose run --rm liquibase update`
- **Checking what's pending**:
  `docker compose run --rm liquibase status --verbose`
- **Demo/seed data** (`mysql/seed.sql`) is separate from schema and is
  never run automatically. After the schema is up to date, load it with:
  `./scripts/seed-db.sh`

## End-to-end tests (Playwright)

`e2e/` is a standalone package holding browser-level tests, organized as
user journeys (Given/When/Then), that exercise a real login and
role-based dashboard routing against a real running stack. Quick start:

```
cd e2e && npm install && npx playwright install --with-deps chromium
./scripts/run-e2e.sh   # run from the repo root
```

See [`e2e/README.md`](e2e/README.md) for the full picture: how the
isolated test stack works, the journey/Given-When-Then structure, what's
currently covered, and its local-only-for-now status.