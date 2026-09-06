# Deploy runbook

Operational steps for deploying, rolling back, and troubleshooting a
production instance of this app on Cloudflare Workers (backend) + Pages
(frontend) + Neon (Postgres database). For the general dev-vs-prod overview
see [`README.md`](README.md#environments-dev-vs-production) first — this
doc assumes that context and focuses on the operational sequence.

## Automated pipeline (the normal path)

Deploys are automated via GitHub Actions — publishing a **GitHub Release**
on `main` triggers `.github/workflows/deploy.yml`, which verifies the
release commit is on `main`, re-runs the backend/frontend test/build
gates, checks for pending Liquibase changesets and applies them only if
any exist, then deploys the Worker, then Pages (sequential, not
parallel — the frontend must never publish pointing at a Worker whose own
deploy/smoke-test failed). If the backend deploy succeeds but the frontend
deploy fails, a final job automatically rolls the Worker back to whatever
version was live before this run, since the frontend (unchanged) is still
serving against it — narrowing the mismatched-pair window down to nothing
without needing a human to react first. Everything below this section
describes what that pipeline does internally, and remains the reference
for deploying by hand (debugging a pipeline failure, one-off changes) or
for a rollback — see `.github/workflows/rollback.yml` for the manual
rollback pipeline (`workflow_dispatch`, independently rolls back
backend/frontend/database; database rollback requires approval via the
`production-db-rollback` GitHub Environment).

**One-time setup** before the pipeline works — see both workflow files'
own comments for details:
1. Create a Cloudflare API token (dashboard → My Profile → API Tokens →
   Custom Token) with `Workers Scripts:Edit`, `Cloudflare Pages:Edit`,
   `Account Settings:Read`, scoped to this account.
2. Add repo secrets/variables: `CLOUDFLARE_API_TOKEN` (the token above),
   `DATABASE_URL` (same value as the Worker's own secret), and the
   `CLOUDFLARE_ACCOUNT_ID` repo *variable* (not secret).
3. Create the `production-db-rollback` GitHub Environment (Settings →
   Environments) with required reviewers, for the database-rollback
   approval gate.

## Staging environment

A genuinely separate deployment target for checking a change against real
infrastructure before cutting a production release — its own Worker
(`ilm-backend-staging`), its own Pages project
(`https://ilm-tracker-staging.pages.dev`), and its own Neon branch
(`staging`, forked from production — an instant copy-on-write copy of the
schema and data, not a fresh empty database).

Deployed via `.github/workflows/staging.yml`, manually triggered
(`workflow_dispatch`) with a `ref` input (defaults to `main`, but can point
at any branch/PR ref) — deliberately not automatic on every push, so it
doesn't churn and can also be used to check an unmerged branch. Reuses
`deploy.yml`'s test-gate and migration-check/apply steps verbatim, just
against staging's own Worker/Pages/database targets, and with neither the
production pipeline's ancestor-of-`main` check nor its approval-gated
rollback machinery (nothing here is real user data, so a bad staging
deploy is just re-run with an older `ref`, or the Neon branch is reset
from its parent in the console).

**One-time setup**, once (already done for this repo — kept here for the
next time a staging environment needs recreating from scratch):
1. Neon console → the project → Branches → Create branch, named `staging`,
   parented off the production branch.
2. `[env.staging]` in `backend/wrangler.toml` (vars + its own
   `RATE_LIMIT_KV` — **not shared with production**, since rate-limit keys
   aren't scoped by hostname and heavy staging testing would otherwise be
   able to exhaust a real production user's limit if they share an IP).
3. Staging Worker secrets, set the same way as production's (see "Rotating
   secrets" below) but with `--env staging` appended, and `DATABASE_URL`
   pointed at the Neon `staging` branch's own connection string, not
   production's.
4. Repo secret `STAGING_DATABASE_URL` — the Neon `staging` branch's
   connection string, for `staging.yml`'s own migration-check step (run
   directly from the Actions runner, same as `DATABASE_URL` is for
   `deploy.yml`). `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` are reused
   as-is from the production pipeline setup.

## Prerequisites

- A Cloudflare account, logged in via `npx wrangler login` (run from
  `backend/`).
- A Neon account and project (Postgres, serverless — Neon is where the
  data actually lives; there's no separate "database host" to provision
  the way Hyperdrive needed one). Create a database/branch and copy its
  connection string.
- That connection string set as a secret, not a `wrangler.toml` `[vars]`
  entry (it carries credentials): `npx wrangler secret put DATABASE_URL`
  (run from `backend/`, prompts for the value — see "Rotating secrets"
  below).
- A KV namespace for the registration/change-password rate limiters:
  `npx wrangler kv namespace create RATE_LIMIT_KV`, put the `id` it prints
  into `wrangler.toml`'s `[[kv_namespaces]]` block.
- The remaining secrets set via `wrangler secret put` (never committed) —
  see "Rotating secrets" below for the full list.
- `wrangler.toml`'s `CORS_ORIGIN` [vars] entry updated to the real
  deployed Pages URL, and a **Cloudflare native Rate Limiting Rule**
  configured on `POST /auth/login` (the Free plan's one rule) — neither of
  these is set by `wrangler deploy` itself.
- A database backup strategy. Neon takes automatic point-in-time-recoverable
  snapshots and supports instant branching from any point in history, which
  covers a lot of what a manual backup script would otherwise need to do —
  but this repo still has no scheduled export of its own, so factor Neon's
  retention window (plan-dependent) into how much history you can actually
  recover before relying on this in production.
- No custom domain is assumed here (default `*.workers.dev` /
  `*.pages.dev`) — see the README's note on why that makes the session
  cookie `SameSite=None` rather than `Lax`. If you add a custom domain
  later on a shared apex, that cookie setting (`backend/src/utils/token.ts`)
  is worth revisiting.

## Stack shape

| Piece | What it is | Notes |
|---|---|---|
| Worker (`backend/`) | Hono API on Cloudflare Workers | Deployed with `wrangler deploy`; no server process to restart, no graceful-shutdown concept — each request runs in its own isolate. |
| Neon | Serverless Postgres | Where the data actually lives. The Worker talks to it directly over WebSocket via `@neondatabase/serverless` (`config/db.ts`) — no separate pooling layer like Hyperdrive in front of it; Neon's own connection architecture handles that. |
| Pages (`frontend/`) | Static Vite build | `VITE_API_URL` is baked into the JS bundle at **build time** — changing it requires a rebuild+redeploy, not just a config change. |
| `docker-compose.yml` | Local Postgres + wsproxy + Liquibase only | Not used for production at all — see below for how prod migrations actually run. `wsproxy` exists only so local Postgres can be reached the same WebSocket way a real Neon host is (see `config/db.ts`) — production talks to Neon directly, no proxy container involved. |

## Routine deploy (rolling out a new version)

```bash
git pull                       # or check out the release commit/tag

cd backend
npm run deploy                 # wrangler deploy

cd ../frontend
npm run build                  # bakes the current VITE_API_URL in
npx wrangler pages deploy dist --project-name=<your-pages-project>
```

If Pages is connected to the repo via Cloudflare's git integration
instead, skip the `wrangler pages deploy` step — a push to the deploy
branch triggers it automatically.

Neither step runs database migrations — do that explicitly (below)
**before** deploying a release that depends on new columns/tables, so the
Worker never sees a schema it doesn't expect.

### Post-deploy smoke test

```bash
curl -sf https://<your-worker>.<subdomain>.workers.dev/healthz
```

A `200` with `{"status":"ok"}` confirms the Worker is up and reached Neon.
There's no pool-stats field the way the old Express version had
(`pool.enqueuedCount`, etc.) — a request-scoped Neon connection has no
long-lived pool to report on from inside the app; saturation/latency
visibility lives in the **Neon console's monitoring** instead. Then do a
real login through the deployed Pages frontend to confirm the full path
(Pages → Worker → Neon) works end to end, including the cross-site
cookie — see the README's `SameSite=None` note, since this is the one
thing local dev (same-site `localhost`) can't verify for you.

## Database migrations

Schema changes are Liquibase changesets in `liquibase/changelog/`. Unlike
before, there's no `db`/`liquibase` containers to depend on in
production — run the Liquibase image directly against the real Neon
database, over a plain (non-WebSocket) `postgresql://` JDBC connection —
Neon exposes a standard Postgres wire-protocol endpoint for tools like
this alongside its serverless HTTP/WebSocket driver, so no wsproxy-style
shim is needed here, just `sslmode=require` (Neon requires TLS):

```bash
docker run --rm \
  -v "$(pwd)/liquibase/changelog:/liquibase/changelog" \
  -e LIQUIBASE_COMMAND_URL="jdbc:postgresql://<neon-host>/<database>?sslmode=require" \
  -e LIQUIBASE_COMMAND_USERNAME="<neon-role>" \
  -e LIQUIBASE_COMMAND_PASSWORD="<password>" \
  -e LIQUIBASE_COMMAND_CHANGELOG_FILE="changelog/changelog-master.xml" \
  liquibase/liquibase:4.29 status --verbose   # or: update
```

(Locally, `docker compose up`/`docker compose run --rm liquibase ...`
still works exactly as before — it's just scoped to the Dockerized dev
`db` now, not a production one.)

Convention for this repo (see root README for the full rule): migrations
are additive and forward-only. **Never edit a changeset that has already
run anywhere** — Liquibase checksums each one and refuses to reapply a
modified file. If a change needs undoing, the normal path is a new
changeset that reverses it, not a rollback.

### Emergency rollback of the last changeset

Every changeset in this repo carries a `--rollback` statement, so
Liquibase's own rollback commands are available as a last resort (e.g. a
changeset that turns out to be destructive and needs undoing *before*
writing a proper forward-fixing changeset) — same `docker run` invocation
as above, with `rollback-count 1` in place of `update`.

Treat this as a break-glass tool, not routine practice — it's exactly the
"hand-editing the schema outside the changelog's own history" that
Liquibase's checksum system is meant to prevent. Confirm with `status
--verbose` afterward, and follow up with a real changeset that captures
the same change through the normal path so the changelog's history stays
authoritative.

## Rolling back a bad deploy

**Application code** (no schema change involved) — Workers keeps deploy
history, so this is usually faster than a redeploy:

```bash
cd backend
npx wrangler deployments list          # find the previous good deployment
npx wrangler rollback [deployment-id]  # instant, no rebuild
```

For Pages, use the deployment history in the Cloudflare dashboard (or
`wrangler pages deployment list` / re-promote a previous deployment) —
same instant-rollback model, no rebuild needed.

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

Set with `wrangler secret put <NAME>` (run from `backend/`, prompts for
the value — never pass secrets as a CLI argument that'd land in shell
history):

- **`JWT_SECRET`**: `npx wrangler secret put JWT_SECRET`. Rotating it
  invalidates every existing session immediately (every cookie fails
  signature verification on its next request) — equivalent to a mass
  forced logout. Fine for a planned rotation, disruptive if done without
  warning users. No redeploy needed — secrets take effect on the next
  request.
- **`DIRECT_DEBIT_WEBHOOK_SECRET`**: `npx wrangler secret put DIRECT_DEBIT_WEBHOOK_SECRET`.
  Only matters once a real payment provider is wired in behind
  `utils/directDebitProvider.ts` — rotating it means updating the
  matching secret on the provider's side in the same change, or its
  webhooks start failing signature verification.
- **`DATABASE_URL`**: rotate the role's password (or reset the connection
  string) in the Neon console first, then
  `npx wrangler secret put DATABASE_URL` with the new value. No Worker
  redeploy needed — secrets take effect on the next request, same as
  `JWT_SECRET` above.

## Troubleshooting

| Symptom | Check |
|---|---|
| Worker returns 500s / won't respond | `npx wrangler tail` (from `backend/`) for live logs — structured JSON via this repo's console-based logger (`utils/logger.ts`). A missing/invalid secret throws from `requireEnv()` (`config/env.ts`), visible in the tail output. |
| `/healthz` returns `{"status":"error"}` | The Worker can't reach Neon — check the Neon project/branch is active (Neon can suspend an idle branch on some plans; a request should auto-wake it, but a very first connection can be slow), and that `DATABASE_URL` is current (`wrangler secret put DATABASE_URL` if it was rotated). |
| Liquibase run fails against the prod host | Check the `LIQUIBASE_COMMAND_URL`/credentials in the `docker run` invocation above match the real Neon connection details, including `sslmode=require`. Do not retry blindly if it's a real SQL error; investigate before rerunning `update`. |
| Requests intermittently slow | Check the **Neon console's monitoring** for connection/query metrics — there's no pool-stats field to check from inside the app once the backend moved off a long-lived connection pool. A query stuck past 15s still fails fast and logs instead of hanging (`config/db.ts`'s query-timeout wrapper), so a spike of those in `wrangler tail` output points at a specific slow query. A cold-started Neon branch waking from idle can also show up as one-off slow first-requests — check whether it's a spike or sustained before assuming a query problem. |
| Login/registration/change-password requests are getting blocked unexpectedly | Login is rate-limited by a **Cloudflare native Rate Limiting Rule** (check the zone's Security > WAF settings, not app code). Registration and change-password use a **Workers-KV-backed approximate limiter** (`utils/rateLimit.ts`) — eventually consistent, so a burst right at the threshold can be a little imprecise; this is a known, accepted tradeoff on the Free plan (no Durable Objects for an exact counter). |
| Sessions dropping unexpectedly | Check whether `JWT_SECRET` was rotated, or whether a user's `token_version` was bumped (logout, password change, or an admin-initiated password reset all do this deliberately, invalidating that user's other sessions). |
| Login works in local dev but not once deployed | Almost certainly the cross-site cookie issue — confirm `wrangler.toml`'s `CORS_ORIGIN` exactly matches the deployed Pages URL, and that the cookie is being set with `SameSite=None; Secure` (`utils/token.ts`). Local dev is same-site (`localhost`), so this class of bug never shows up there — only a real deploy exercises it. |

## Feature flags

New functionality in this app is typically gated behind a feature flag
(`feature_flags` table, managed from the System Admin dashboard), off by
default until a school opts in or it's enabled platform-wide. A deploy
that ships a new flag doesn't need any special rollout step — the flag
defaults to disabled, so the feature is inert until explicitly turned on.
Every flag/override change is recorded in `feature_flag_audit_log`,
viewable from the same dashboard, if you need to confirm who enabled what
and when after an incident.
