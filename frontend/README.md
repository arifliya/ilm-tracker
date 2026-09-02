# ilm-frontend

React/TypeScript SPA for ilm-school-portal — one role-based dashboard per
user type (system admin, owner, maintainer, admin, teacher, parent,
student), talking to the backend REST API.

## Stack

- React 18 + TypeScript, built with Vite
- React Router (single `/dashboard` route, content switched by role)
- Axios, with an httpOnly session cookie for auth (no token handling in JS)
- Vitest + Testing Library for tests
- Served in production via nginx (see `Dockerfile` / `nginx.conf`)

## Getting started

Normally this runs via `docker compose up` from the repo root, alongside
the backend and MySQL — see the root README. To run it standalone against
an already-running backend:

```
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL if the backend isn't on localhost:4000
npm run dev             # Vite dev server, http://localhost:5173
```

Other scripts:

- `npm run build` — production build to `dist/` (`vite build`)
- `npm run preview` — serve the production build locally
- `npm test` — run the Vitest suite
- `npm run lint` / `npm run lint:fix` — ESLint

## Environment variables

- `VITE_API_URL` — base URL of the backend API, e.g.
  `http://localhost:4000/api`. Defaults to that value if unset. Vite bakes
  `VITE_*` vars into the JS bundle **at build time** — in Docker this
  arrives as a build `ARG`, so the image must be rebuilt (not just
  restarted) whenever it changes.

## Project layout

```
src/
  main.tsx              entry point
  AppRouter.tsx           routes: public pages + the single /dashboard route,
                            which renders a dashboard component chosen by role
  AuthContext.tsx          current user, login/logout, session state
  api.ts                   axios instance; on any 401 response, fires an
                            "auth:unauthorized" event AuthContext listens for
  pages/
    Home.tsx, Login.tsx, Register.tsx, PendingApproval.tsx,
    PrivacyPolicy.tsx, NoDashboard.tsx
    dashboards/            one component per role — SystemAdminDashboard,
                            OwnerDashboard, MaintainerDashboard, AdminDashboard,
                            TeacherDashboard, ParentDashboard, StudentDashboard
  components/             BaseDashboard (shared shell/layout), NavBar,
                            SidebarItem, Pagination, SearchSort, ConfirmDialog,
                            ChildFormFields, InactivityWatcher, Footer
  hooks/
    useAuth.ts               reads AuthContext
    useInactivityLogout.ts    auto-logout after idle timeout
    usePolling.ts             periodic refetch (e.g. notifications inbox)
  utils/                   formatDate, downloadCsv, getErrorMessage,
                            password (client-side policy check), tableHelpers
__tests__/               Vitest + Testing Library, mirrors src/ layout
```

## Auth model

Login/logout hit the backend, which sets/clears an httpOnly session
cookie — the frontend never stores or reads a token directly.
`AuthContext` holds the current user in memory (fetched on load) and
listens for the `auth:unauthorized` event dispatched by `api.ts`'s
response interceptor to clear state and redirect to `/login` when a
session expires or is revoked server-side. `InactivityWatcher` +
`useInactivityLogout` additionally log the user out client-side after a
period of no activity, independent of token expiry.

## Routing model

There's a single protected route, `/dashboard`; `AppRouter.tsx`'s
`RoleRouter` picks which dashboard component to render based on
`user.role` from `AuthContext`. A `pending` role (registered but not yet
approved by an admin) is redirected to `/pending` instead. Adding a new
role means adding a `case` there and a matching page under
`pages/dashboards/`.

## Testing

```
npm test
```

Component/page tests use Vitest + Testing Library (`jsdom` environment);
API calls are mocked at the `api.ts` boundary rather than hitting a real
backend.
