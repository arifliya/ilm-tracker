# ilm-backend

Express/TypeScript REST API for ilm-school-portal — auth, school/class/user
management, attendance, tasks, notifications, and student notes, backed by
MySQL.

For the full request/response contract of every route, see
[`openapi.yaml`](./openapi.yaml) (view it via
[editor.swagger.io](https://editor.swagger.io) or `npx @redocly/cli
build-docs openapi.yaml -o api-docs.html`). This README covers running and
developing the service itself.

## Stack

- Express 4 + TypeScript
- MySQL (via `mysql2`), schema managed by Liquibase (see root README)
- JWT auth in an httpOnly cookie, `bcryptjs` password hashing
- `helmet`, `express-rate-limit`, CORS allow-list, `trust proxy` config
- `pino`/`pino-http` structured logging
- Jest + Supertest for tests

## Getting started

Normally you run this via `docker compose up` from the repo root (see the
root README) — that wires up MySQL, Liquibase, and the frontend together.
To run the backend standalone against an already-running DB:

```
cd backend
npm install
cp .env.example .env   # fill in real values, see below
npm run dev             # ts-node-dev, restarts on change
```

Other scripts:

- `npm run build` — compile to `dist/` (`tsc`)
- `npm start` — run the compiled build (`dist/server.js`)
- `npm test` — run the Jest suite
- `npm run lint` / `npm run lint:fix` — ESLint

## Environment variables

See `.env.example` for the full list with inline explanations. Summary:

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | defaults to `4000` |
| `DB_HOST` / `DB_USER` / `DB_NAME` | no | default to the docker-compose service names |
| `DB_PASSWORD` | **yes** | no default — startup fails fast if unset |
| `JWT_SECRET` | **yes** | no default — `openssl rand -hex 32` |
| `COOKIE_SECURE` | no | set `true` once served over HTTPS |
| `CORS_ORIGIN` | no | comma-separated list of allowed frontend origins |
| `TRUST_PROXY` | no | Express `trust proxy` setting; leave `false` unless behind a reverse proxy — see the comment in `src/config/env.ts` |
| `NODE_ENV` | no | `production` suppresses error detail in 500 responses |

`DB_PASSWORD` and `JWT_SECRET` intentionally have no defaults — see
`src/config/env.ts`'s `required()` — so the process refuses to start
rather than silently running with a guessable secret.

## Project layout

```
src/
  app.ts              Express app: middleware, route mounting, error handler
  server.ts            HTTP server bootstrap + graceful shutdown
  config/
    env.ts              env var loading/validation
    db.ts               MySQL connection pool
  middleware/
    auth.ts             JWT verification, req.user, requireRole()
  routes/
    auth.ts              login/register/logout, refresh, revocation
    admin.ts              classes, pending users, staff/student assignment, reports
    systemAdmin.ts         schools, platform-wide user approval
    teacher.ts / student.ts / parent.ts   role-scoped dashboards/actions
    features.ts            per-school feature flag admin
    notifications.ts       staff -> parent/staff broadcast messages
    notes.ts                per-student notes
  types/                 shared request/JWT types
  utils/                  logger, token signing/verification, feature flags
__tests__/              Jest + Supertest, mirrors src/ layout
```

## Auth model

- Login issues a JWT in an httpOnly, `SameSite` cookie (not readable by
  frontend JS). `COOKIE_SECURE` gates the `Secure` flag.
- Sessions slide: a request past the halfway point of the token's lifetime
  gets a reissued cookie, so active users aren't hard-logged-out.
- Logout is a real server-side revocation, not just clearing the cookie —
  each JWT embeds a `token_version` snapshot checked against the user's
  current `token_version` column on every request.
- Roles: `system_admin` (platform-wide, no single school), `owner`,
  `admin`, `maintainer`, `teacher`, `staff`, `parent`, `student`. Route
  guards are declared per-file as `requireRole(...)` groups (e.g.
  `admin.ts`'s `STAFF_MGMT` / `USER_MGMT` / `REPORT_ROLES`) — check the
  top of a route file for what a given group means before adding a route
  to it.

## Feature flags

Some functionality (`attendance_report`, `notifications`, `student_notes`)
is gated per-school via a `feature_flags` table, checked with
`utils/featureFlags.ts#isFeatureEnabled`. `system_admin` manages flags via
`routes/features.ts`; a disabled flag returns 403 on writes and an empty
result on reads, not a hard error, so the frontend degrades gracefully.

## Testing

```
npm test
```

Route handlers are tested with Supertest against the real Express app,
with the DB pool mocked (see `src/config/__mocks__/db.ts` and
`__tests__/setupAuthMocks.ts`, wired in via Jest's
`setupFilesAfterEnv`) — no live database needed to run the suite.
