# Ilm Tracker

A multi-tenant school management portal: parents, teachers, and school
staff each get a role-scoped dashboard for attendance, tasks,
notifications, and student notes, with a platform-level `system_admin`
role for onboarding new schools and managing feature rollout.

## Stack

- **Backend** (`backend/`) — Hono + TypeScript API running on
  **Cloudflare Workers**, Postgres via **Neon**'s serverless driver
  (`@neondatabase/serverless`, one connection per request — see
  `config/db.ts`), JWT session cookies (`hono/jwt`). See
  [`backend/README.md`](backend/README.md).
- **Frontend** (`frontend/`) — React + TypeScript SPA (Vite), deployed
  to **Cloudflare Pages**. See [`frontend/README.md`](frontend/README.md).
- **Database** — Postgres, hosted on **Neon** (see `DEPLOY_RUNBOOK.md`),
  schema managed by Liquibase (below). A local Postgres for dev runs via
  Docker, reached the same WebSocket way a real Neon host is via a small
  local proxy (`wsproxy`, also in `docker-compose.yml`) — see
  `backend/README.md`'s local-dev section for why.
- **Local orchestration** — `docker-compose.yml` runs local Postgres,
  `wsproxy`, and a one-shot Liquibase migration step now; the backend runs
  via `wrangler dev` and the frontend via `vite dev`, neither of which are
  Docker containers.

## Roles

`system_admin` (platform-wide, not tied to a school) → `owner` →
`admin`/`maintainer` → `teacher`/`staff` → `parent` → `student`, plus a
`pending` state for newly registered users awaiting approval. Each school
is an isolated tenant: staff and parents register into a school using a
school code (and, for parents, a class code per child), and
`system_admin` is the only role that can see or act across schools.

## Running it locally

Three pieces, run separately (no single `docker compose up` brings up the
whole stack anymore — Workers/Pages aren't containers):

```
cp .env.example .env    # fill in real secrets, see inline comments
docker compose up -d    # Postgres + wsproxy + a one-shot Liquibase migration step
```

```
cd backend
cp .dev.vars.example .dev.vars   # fill in real secrets
# DATABASE_URL should point at the "db" host (the docker-compose service
# name, not "localhost") with your .env's POSTGRES_PASSWORD:
# postgres://ilmuser:<password>@db:5432/ilm — config/db.ts detects that
# host and routes the connection through the local wsproxy container
# instead of assuming a real Neon host. This is a local-only edit, don't
# commit real credentials.
npm run dev              # wrangler dev, http://localhost:8787
```

```
cd frontend
npm run dev               # vite dev, http://localhost:5173
```

Load demo data once Postgres is healthy and migrations have run:
`./scripts/seed-db.sh`. For day-to-day development details see the
backend/frontend READMEs linked above.

## Environments: dev vs. production

Local dev (above) runs against Docker Postgres with no TLS, `COOKIE_SECURE`
effectively off, and a same-site `localhost` frontend/backend pair — none
of that applies once deployed.

For a real deployment: the backend deploys to Cloudflare Workers
(`wrangler deploy`) and the frontend to Cloudflare Pages (git-integrated,
or `wrangler pages deploy`). Neither uses this repo's `docker-compose.yml`
— that file is local-dev-only now. The database is a Neon project you
provision separately (Neon is where the data lives — there's no
Hyperdrive-style intermediary), its connection string set as the
`DATABASE_URL` secret. Secrets (`DATABASE_URL`, `JWT_SECRET`,
`DIRECT_DEBIT_WEBHOOK_SECRET`) are all set with
`wrangler secret put <NAME>`, never committed.

**No custom domain yet**: deploying on the default `*.pages.dev` /
`*.workers.dev` subdomains means the frontend and backend are on different
*sites* (not just different origins) as far as cookies are concerned, so
the session cookie uses `SameSite=None; Secure` rather than the tighter
`SameSite=Lax` a same-site custom-domain setup would allow — see
`backend/src/utils/token.ts`. Revisit this once both sit on subdomains of
the same domain.

This repo has no database backup strategy of its own beyond what Neon
provides automatically (point-in-time recovery, branching) — see
`DEPLOY_RUNBOOK.md` for the retention caveats.

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
SQL file. Locally, `docker compose up` runs a one-shot `liquibase` service
that applies any changesets in `liquibase/changelog/` that haven't run yet
against the local `db` service. It only ever touches schema — it never
inserts, updates, or deletes application data.

Production migrations run the same Liquibase image/changelog against your
Neon database — see `DEPLOY_RUNBOOK.md` for the exact command (there's no
`db` container in production to depend on).

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