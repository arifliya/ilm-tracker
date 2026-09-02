# Deploy runbook

Operational steps for deploying, rolling back, and troubleshooting a
production instance of this app. For the general dev-vs-prod overview (env
files, the `docker-compose.prod.yml` overlay, TLS/reverse-proxy
expectations) see [`README.md`](README.md#environments-dev-vs-production)
first — this doc assumes that context and focuses on the operational
sequence.

## Prerequisites

- Docker Compose **v2.24+** (`docker compose version`) — the prod overlay
  relies on the `!override` YAML merge tag to actually close MySQL's port,
  which older Compose silently ignores.
- `.env` and `backend/.env` populated from `.env.production.example` /
  `backend/.env.production.example`, with every `changeme` value replaced —
  see the comments in those files for what each one controls.
- A reverse proxy / TLS termination in front of this stack. Nothing in this
  repo terminates HTTPS itself; `frontend`/`backend` are expected to sit
  behind something that does (ALB, Cloudflare, nginx, ...).
- A database backup strategy. **This repo does not provide one** — no
  scheduled dump, no point-in-time recovery. Set one up at the
  infrastructure layer (e.g. periodic `mysqldump` off-box, or your cloud
  provider's managed-MySQL backups) before relying on this in production.
  The steps below assume a recent backup exists before any migration or
  rollback.

## Stack shape

| Service | What it is | Notes |
|---|---|---|
| `db` | MySQL 8 | Port only published to the host in dev; closed in prod by the overlay. |
| `liquibase` | One-shot migration runner | Exits after applying pending changesets; not a long-running service. |
| `backend` | Express API | `NODE_ENV=production` always (baked into the image); graceful SIGTERM shutdown (drains in-flight requests, closes the DB pool) so a rolling restart doesn't drop live requests. |
| `frontend` | Static build served by nginx | `VITE_API_URL` is baked into the JS bundle at **build time** — changing it requires an image rebuild, not just a restart. |

All four are defined in `docker-compose.yml`; `docker-compose.prod.yml` is
an overlay applied on top, never used standalone.

## Routine deploy (rolling out a new version)

Always use the wrapper script — it guarantees the prod overlay is applied,
which a bare `docker compose` command out of habit would silently skip:

```bash
git pull                       # or check out the release commit/tag
./scripts/deploy-prod.sh up -d --build
```

What this does, in order:
1. Rebuilds `backend`/`frontend` images from the current source.
2. Recreates `db` if its config changed (rare — usually a no-op).
3. Runs `liquibase` to apply any new changesets in
   `liquibase/changelog/` (idempotent — already-applied changesets are
   skipped). `backend` won't start until this exits successfully
   (`depends_on: condition: service_completed_successfully`).
4. Recreates `backend`, then `frontend` once `backend` reports healthy.

### Post-deploy smoke test

```bash
# From the host running the containers — bypasses the reverse proxy, so
# this checks the backend process itself is up and can reach the DB:
docker compose exec backend node -e "require('http').get('http://127.0.0.1:4000/healthz',r=>{console.log(r.statusCode)})"

# Through the proxy, if it's configured to forward /healthz externally
# (it isn't routed under /api — see backend/src/app.ts):
curl -sf https://<your-domain>/healthz
```

A `200` with `{"status":"ok","pool":{...}}` confirms the process is up and
the DB is reachable. `pool.enqueuedCount` climbing on repeat checks means
the connection pool is saturated — see Troubleshooting below. Then do a
real login through the frontend to confirm the full request path (proxy →
frontend → backend → db) works end to end, not just the container-internal
health check.

## Database migrations

Schema changes are Liquibase changesets in `liquibase/changelog/`, applied
automatically by the `liquibase` service on every `up`. For manual control:

```bash
# What's pending, without applying anything:
docker compose run --rm liquibase status --verbose

# Apply pending changesets without touching backend/frontend:
docker compose run --rm liquibase update
```

Convention for this repo (see root README for the full rule): migrations
are additive and forward-only. **Never edit a changeset that has already
run anywhere** — Liquibase checksums each one and refuses to reapply a
modified file. If a change needs undoing, the normal path is a new
changeset that reverses it, not a rollback.

### Emergency rollback of the last changeset

Every changeset in this repo carries a `--rollback` statement, so
Liquibase's own rollback commands are available as a last resort (e.g. a
changeset that turns out to be destructive and needs undoing *before*
writing a proper forward-fixing changeset):

```bash
docker compose run --rm liquibase rollback-count 1
```

Treat this as a break-glass tool, not routine practice — it's exactly the
"hand-editing the schema outside the changelog's own history" that
Liquibase's checksum system is meant to prevent. Confirm with `status
--verbose` afterward, and follow up with a real changeset that captures
the same change through the normal path so the changelog's history stays
authoritative.

## Rolling back a bad deploy

**Application code** (no schema change involved): redeploy the previous
known-good commit the same way as a normal deploy:

```bash
git checkout <previous-good-ref>
./scripts/deploy-prod.sh up -d --build
```

`liquibase update` on the old code is a no-op if no new changesets shipped
in the bad release — safe to run unconditionally as part of the same
command.

**A release that included a schema change**: roll back application code
first (above), then decide whether the schema change needs undoing too:
- If the new columns/tables are additive and simply unused by the old code
  — nothing to do, leave the schema as-is.
- If the old code actively breaks against the new schema (e.g. a column it
  doesn't expect became `NOT NULL`) — restore from backup, or use
  `rollback-count` per the changeset(s) involved, per the emergency
  procedure above. Confirm which case you're in before rolling the schema
  back; the wrong call here is worse than leaving app code on the older
  version briefly.

## Rotating secrets

- **`JWT_SECRET`**: rotating it invalidates every existing session
  immediately (every cookie fails signature verification on its next
  request) — equivalent to a mass forced logout. Fine for a planned
  rotation, disruptive if done without warning users.
- **DB passwords** (`MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`): update both
  `.env` and `backend/.env` together (`DB_PASSWORD` must match
  `MYSQL_PASSWORD`), then `./scripts/deploy-prod.sh up -d --build` to
  recreate `db` and `backend` with the new values. MySQL only picks up a
  changed root/user password on container recreation, not a plain
  restart.

## Troubleshooting

| Symptom | Check |
|---|---|
| `backend` won't become healthy | `docker compose logs backend` — likely a DB connectivity issue or a missing/invalid env var (`env.ts` validates required vars at startup and fails fast, which is intentional). |
| `liquibase` exits non-zero, `backend` never starts | `docker compose logs liquibase` — a changeset failed to apply. Do not retry blindly if it's a real SQL error (as opposed to the transient-connection retry loop it already does automatically); investigate before rerunning `update`. |
| Requests intermittently slow or timing out | Check `/healthz`'s `pool` field. `enqueuedCount` increasing means requests are queueing for a DB connection (pool is saturated at `connectionLimit`); a query stuck past 15s now fails fast and logs instead of hanging (see `backend/src/config/db.ts`), so a spike of those in the logs points at a specific slow query to investigate rather than a general hang. |
| DB reachable from outside the host after a prod deploy | `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` and confirm `services.db.ports` is absent entirely. If it still lists `3306`, the overlay wasn't applied — you likely ran `docker compose` directly instead of `./scripts/deploy-prod.sh`. |
| Sessions dropping unexpectedly | Check whether `JWT_SECRET` was rotated, or whether a user's `token_version` was bumped (logout, password change, or an admin-initiated password reset all do this deliberately, invalidating that user's other sessions). |

## Feature flags

New functionality in this app is typically gated behind a feature flag
(`feature_flags` table, managed from the System Admin dashboard), off by
default until a school opts in or it's enabled platform-wide. A deploy
that ships a new flag doesn't need any special rollout step — the flag
defaults to disabled, so the feature is inert until explicitly turned on.
Every flag/override change is recorded in `feature_flag_audit_log`,
viewable from the same dashboard, if you need to confirm who enabled what
and when after an incident.
