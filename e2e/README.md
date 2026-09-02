# E2E tests

Browser-level tests that exercise a real login and role-based dashboard
routing against a real running stack (real backend, real MySQL) — unlike
the `backend`/`frontend` unit suites, which run against mocked DB/API
calls. This is a standalone npm package: its own `package.json`/lockfile,
not linked to `backend`/`frontend` via workspaces, since these tests only
ever talk to the app over HTTP/browser and share no code with either.

## Setup (one time)

```
cd e2e
npm install
npx playwright install --with-deps chromium
```

## Running

From the repo root:

```
./scripts/run-e2e.sh
```

This spins up an isolated Compose project (`-p ilm-e2e`, its own volume,
separate from your regular dev stack's database), seeds it with
`mysql/seed.sql`, runs the suite, and tears everything down again on exit
— pass or fail.

Requirements:
- `backend/.env` must exist (see the root README's "Running it locally").
- Your regular dev stack must be **fully down**
  (`docker compose down`, not just stopped) — `docker-compose.yml`'s
  services have fixed container names, so a stopped-but-not-removed
  container still reserves its name and will collide with the E2E run.

Tests run in a **visible (headed) browser window, one at a time** — that's
deliberate: the point of headed mode here is to actually watch a journey
happen, which several parallel windows would work against. Expect a real
Chrome window to open and drive itself through each journey; don't
interact with it mid-run.

To inspect a run afterward: `npm --prefix e2e run report` opens the last
HTML report (screenshots/traces on failure).

## Structure: journeys, not technical suites

Specs live under `tests/journeys/`, one file per user journey rather than
grouped by technical concern (no generic `auth.spec.ts` grab-bag). Each
test is written as named **Given/When/Then** steps via Playwright's
`test.step()`, which also makes each step its own entry in the HTML
report/trace:

```ts
test("a user with valid credentials reaches their dashboard", async ({ page }) => {
  await test.step("Given a seeded user account (owner1)", async () => { ... });
  await test.step("When they submit their correct username and password", async () => { ... });
  await test.step("Then they are redirected to their dashboard", async () => { ... });
});
```

Shared Given/When/Then building blocks live in `helpers/`, so each
journey composes them rather than repeating Playwright locator calls
inline:
- **`helpers/auth.ts`** — `loginAs`/`logout`, login-form steps, seed
  password constant.
- **`helpers/nav.ts`** — `clickNavItem`: dashboard sidebar items
  (`SidebarItem.tsx`) are plain `<div onClick>`, not real `<button>`s, so
  `getByRole('button', ...)` never matches them — this is the one
  locator every journey needs for navigation.
- **`helpers/forms.ts`** — `fieldByLabel`: most forms across the app pair
  `<label>`/`<input>` as plain siblings with no `htmlFor`/`id`, so
  `getByLabel()` can't find them either. Handles labels built from
  multiple JSX text nodes (e.g. `{cls.class_name} (£)`) correctly — see
  the comment in the file for why a naive XPath `text()` silently breaks
  on those.
- **`helpers/registration.ts`** — the public parent-registration form.

### A note on "client-side validation" journeys

Several forms mark their fields `required`/`minLength`/`min` at the HTML
level, which makes the browser block submission — and the *app's own* JS
validation message — before any click handler runs. Those journeys assert
the field's `validity.valid` is `false` instead of an error message (see
e.g. `tasks-and-homework.spec.ts`'s missing-due-date case). Where a field
has no native constraint, the real rendered error message is asserted
instead (e.g. `report-cards.spec.ts`'s missing-subjects case).

## Journey inventory

| File | Covers |
|---|---|
| `login.spec.ts` | Valid/invalid login, logout |
| `dashboard-access.spec.ts` | Every role lands on its own dashboard (Maintainer/Treasurer/Student break the common heading pattern — handled explicitly) |
| `registration-and-approval.spec.ts` | Public parent registration → owner approval → new parent can log in; duplicate email; missing field; owner rejection |
| `class-and-teacher-management.spec.ts` | Create class, assign teacher, assign student; duplicate class code |
| `approvals-and-roles.spec.ts` | Maintainer adds a role; empty role name; approving without picking a role |
| `attendance.spec.ts` | Teacher marks attendance; CSV report download; invalid date range |
| `tasks-and-homework.spec.ts` | Teacher creates/deletes a task, parent sees it; missing due date |
| `student-notes.spec.ts` | Teacher note, parent reads it; empty note |
| `notifications.spec.ts` | Send + receive; missing audience |
| `report-cards.spec.ts` | Admin creates, parent views read-only; no subjects |
| `timetable.spec.ts` | Term/event/class-slot setup, parent sees schedule; end before start |
| `fees-and-direct-debit.spec.ts` `@flagged` | Fee period + apply-by-class + mark paid; direct debit setup/cancel; no-amount error; disabled-school states (unflagged, uses Greenwood) |
| `bulk-upload.spec.ts` | CSV template download + valid upload; empty file |
| `parent-children.spec.ts` | Add child; guardian-link request + admin approval; short postcode; empty guardian code |
| `change-password.spec.ts` `@flagged` | Change password, stay signed in; mismatched confirmation |
| `system-admin.spec.ts` | Create school; create + toggle a feature flag, audit log entry; empty name; invalid feature key |
| `analytics.spec.ts` `@flagged` | Analytics dashboard renders |
| `student-self-service.spec.ts` | Student views My Classes / My Tasks |
| `teacher-parent-contact.spec.ts` | Teacher views a student's parent contact info from the class register |

Adding a new journey: create `tests/journeys/<journey-name>.spec.ts`,
reuse or extend the helpers above, keep each test's steps readable as a
Given/When/Then narrative. Seeded test accounts (all roles, all sharing
the password `Passw0rd!`) are listed in `../mysql/seed.sql`.

### The `@flagged` tag

Journeys whose happy path needs a feature flag that's off by default in
production (`fees`, `direct_debit`, `password_management`,
`analytics_dashboard`) are tagged via Playwright's native
`test.describe(..., { tag: "@flagged" })`. `mysql/seed.sql` turns all
9 flags on for `ILM2026` specifically so these have a deterministic
precondition with no runtime setup step — see the comment above the
`school_feature_flags` insert there. `GRN2026` deliberately has zero
overrides (every flag off) and backs the "disabled state" journeys, which
are **not** tagged since they need no flag precondition.

- `./scripts/run-e2e.sh` — core only (default), skips `@flagged`
- `./scripts/run-e2e.sh --all` — everything, including `@flagged`
- `npm run test:core` / `npm run test` (from `e2e/`) — the same split, if
  you're driving Playwright directly against an already-running stack

### Fixtures added on top of the normal seed data

- `treasurer2` (GRN2026) — a treasurer for the always-disabled school, so
  the disabled-fee-tracking journey needs no runtime flag toggling.
- The `ILM2026` `school_feature_flags` overrides mentioned above.

Journeys that mutate shared fixtures (e.g. registering an extra child for
`parent1`, or creating extra classes) are written defensively — using
`.first()`/scoped locators — since other journeys running earlier in the
same suite can add rows to the same tables. Search the specs for
`.first()` comments if a locator choice looks unmotivated; it's usually
guarding against exactly this.

## Scope and status

Local/manual only for now — **not** wired into `.github/workflows/ci.yml`.
E2E suites tend to start flaky; the plan is to prove this out locally
first and add it to CI once there's real confidence in it.

This targets the current branch's stack (Express backend + nginx-served
frontend via `docker-compose.yml`). If the parked
`feat/cloudflare-development` migration lands, `scripts/run-e2e.sh`'s
stack-startup step will need updating — that Compose file no longer runs
`backend`/`frontend` services.
