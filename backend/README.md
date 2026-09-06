# ilm-backend

Hono/TypeScript REST API for Ilm Tracker — auth, school/class/user
management, attendance, tasks, notifications, and student notes — running
on Cloudflare Workers, backed by Postgres via Neon's serverless driver.

For the full request/response contract of every route, see
[`openapi.yaml`](./openapi.yaml) (view it via
[editor.swagger.io](https://editor.swagger.io) or `npx @redocly/cli
build-docs openapi.yaml -o api-docs.html`). This README covers running and
developing the service itself.

## Stack

- Hono + TypeScript, running on Cloudflare Workers
- Postgres (via `@neondatabase/serverless`, Neon's driver), one WebSocket
  connection per request (see `config/db.ts`) — schema managed by
  Liquibase (root README)
- `hono/jwt` auth in an httpOnly cookie, `bcryptjs` password hashing
- CORS allow-list, Workers-KV-backed rate limiting for
  registration/change-password (`utils/rateLimit.ts`) — login itself is
  rate-limited by a Cloudflare native Rate Limiting Rule, not app code
- Structured logging via `utils/logger.ts` (console-based — Workers has no
  file/stdout process the way Node did)
- Jest + `ts-jest`, requests driven through a small `app.request()`-based
  test helper (`__tests__/helpers/request.ts`) rather than Supertest

## Getting started

Run against the local Postgres + `wsproxy` from `docker compose up -d` at
the repo root (see the root README) — there's no `docker compose up` that
brings up the backend itself anymore, since Workers isn't a container:

```
cd backend
npm install
cp .dev.vars.example .dev.vars   # fill in real secrets — see below
# DATABASE_URL should use "db" as the host (the docker-compose service
# name, not "localhost") with your .env's POSTGRES_PASSWORD:
# postgres://ilmuser:<password>@db:5432/ilm — this is a local-only edit,
# don't commit real credentials there.
npm run dev              # wrangler dev, http://localhost:8787
```

**Why `db`, not `localhost`, and what `wsproxy` is for**: this driver
talks to Postgres over WebSocket, and by default assumes Neon's own
WebSocket proxy sits in front of whatever host you give it — real Neon
databases provide that automatically. Local Postgres doesn't, so
`docker-compose.yml` runs `wsproxy` (Neon's own small proxy) in front of
it instead, and `config/db.ts` detects the `db`/`localhost` hostname and
points the driver at that local proxy rather than assuming a real Neon
host. None of this applies in any deployed environment — there,
`DATABASE_URL` is a real Neon connection string and the driver talks to
Neon's own proxy as normal.

Other scripts:

- `npm run build` — type-check only (`tsc --noEmit`); the actual build is
  bundled by `wrangler deploy`/`wrangler dev` themselves, there's no
  separate `dist/` compile step
- `npm run deploy` — `wrangler deploy`, ships to Cloudflare
- `npm test` — run the Jest suite
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run cf-typegen` — regenerate `worker-configuration.d.ts` from
  `wrangler.toml`'s bindings

## Environment variables / config

Non-secret config lives in `wrangler.toml`'s `[vars]`; secrets are set with
`wrangler secret put <NAME>` in production, or `backend/.dev.vars`
(git-ignored, copy from `.dev.vars.example`) for local `wrangler dev`.
There's no process-wide `process.env` the way Express's `dotenv`-based
config used to provide — everything is read off `c.env` via
`config/env.ts`'s `requireEnv()`/`isCookieSecure()`/`corsOrigins()`.

| Variable | Where | Notes |
|---|---|---|
| `DATABASE_URL` | secret | Postgres connection string — a real Neon connection string in production (`wrangler secret put DATABASE_URL`), or the local Postgres/`wsproxy` setup above for dev |
| `JWT_SECRET` | secret | `openssl rand -hex 32` — no default, `requireEnv()` throws if unset |
| `DIRECT_DEBIT_WEBHOOK_SECRET` | secret | only matters once a real payment provider is wired in |
| `NODE_ENV` | `[vars]` | `production` in `wrangler.toml`; irrelevant locally |
| `COOKIE_SECURE` | `[vars]` | gates the cookie's `Secure` flag |
| `CORS_ORIGIN` | `[vars]` | comma-separated list of allowed frontend origins |

## Project layout

```
src/
  app.ts              Hono app: middleware, route mounting, error handler
  config/
    env.ts              c.env-based config accessors (requireEnv, isCookieSecure, corsOrigins)
    db.ts               per-request Neon connection (dbMiddleware)
  middleware/
    auth.ts             JWT verification, c.get("user"), requireRole()
  routes/
    auth.ts              login/register/logout, refresh, revocation, forced password reset
    admin.ts              classes, pending users, staff/student assignment, reports
    systemAdmin.ts         schools, platform-wide user approval
    teacher.ts / student.ts / parent.ts   role-scoped dashboards/actions
    features.ts            per-school feature flag admin
    notifications.ts       staff -> parent/staff broadcast messages
    notes.ts                per-student notes
  types/                 shared request/JWT/env types
  utils/                  logger, token signing/verification, feature flags, rate limiting
__tests__/              Jest + ts-jest, mirrors src/ layout (tsconfig.jest.json)
```

## Auth model

- Login issues a JWT in an httpOnly, `SameSite` cookie (not readable by
  frontend JS). `COOKIE_SECURE` gates the `Secure` flag. Deploying on
  default `*.pages.dev`/`*.workers.dev` subdomains means frontend and
  backend are different sites, not just different origins — the cookie is
  `SameSite=None` accordingly (see `utils/token.ts`).
- Sessions slide: a request past the halfway point of the token's lifetime
  gets a reissued cookie, so active users aren't hard-logged-out, capped at
  an absolute 12h session lifetime.
- Logout is a real server-side revocation, not just clearing the cookie —
  each JWT embeds a `token_version` snapshot checked against the user's
  current `token_version` column on every request.
- A `mustResetPassword` claim blocks every route except `/auth/me`,
  `/auth/logout`, and `/auth/force-password-reset` once an admin/owner/
  system_admin resets a user's password, until they complete that flow.
- Roles: `system_admin` (platform-wide, no single school), `owner`,
  `admin`, `maintainer`, `teacher`, `staff`, `parent`, `student`. Route
  guards are declared per-file as `requireRole(...)` groups (e.g.
  `admin.ts`'s `STAFF_MGMT` / `USER_MGMT` / `REPORT_ROLES`) — check the
  top of a route file for what a given group means before adding a route
  to it.

## Feature flags

Some functionality (`attendance_report`, `notifications`, `student_notes`,
`password_management`, `teacher_parent_contact`) is gated per-school via a
`feature_flags` table, checked with `utils/featureFlags.ts#isFeatureEnabled`.
`system_admin` manages flags via `routes/systemAdmin.ts`; a disabled flag
returns 403 on writes and an empty result on reads, not a hard error, so
the frontend degrades gracefully.

## Testing

```
npm test
```

Route handlers are tested by driving a real Hono app through
`app.request()` (wrapped by `__tests__/helpers/request.ts` to look like
Supertest's `request(app).get(...)` chain), with the DB connection mocked
(see `src/config/__mocks__/db.ts` and `__tests__/setupAuthMocks.ts`, wired
in via Jest's `setupFilesAfterEnv`) — no live database needed to run the
suite.
