# ilm-frontend

React/TypeScript SPA for Ilm Tracker — one role-based dashboard per
user type (system admin, owner, maintainer, admin, teacher, parent,
student), talking to the backend REST API. Deployed as a static build to
Cloudflare Pages.

## Stack

- React 18 + TypeScript, built with Vite
- React Router (single `/dashboard` route, content switched by role)
- Axios, with an httpOnly session cookie for auth (no token handling in JS)
- Vitest + Testing Library for tests
- Deployed to Cloudflare Pages — `public/_headers` (security headers) and
  `public/_redirects` (SPA fallback to `index.html`) replace the old
  nginx config

## Getting started

Run against an already-running backend (`wrangler dev`, see
`backend/README.md`, or the root README for the full local setup):

```
cd frontend
npm install
cp .env.example .env.local   # set VITE_API_URL if the backend isn't on localhost:8787
npm run dev                   # Vite dev server, http://localhost:5173
```

Other scripts:

- `npm run build` — production build to `dist/` (`vite build`)
- `npm run preview` — serve the production build locally
- `npm test` — run the Vitest suite
- `npm run lint` / `npm run lint:fix` — ESLint

Deploying: `npx wrangler pages deploy dist --project-name=<your-pages-project>`
(see `DEPLOY_RUNBOOK.md`) — or, if Pages is connected to the repo via
Cloudflare's git integration, a push to the deploy branch does this
automatically.

## Environment variables

- `VITE_API_URL` — base URL of the backend API, e.g.
  `http://localhost:8787/api` locally (wrangler dev's default port) or the
  deployed Worker's URL in production. Defaults to
  `http://localhost:8787/api` if unset. Vite bakes `VITE_*` vars into the
  JS bundle **at build time** — changing it means a rebuild+redeploy, not
  just a config change (there's no running container to restart).

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
    ForcePasswordReset.tsx, PrivacyPolicy.tsx, NoDashboard.tsx
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
period of no activity, independent of token expiry. A `mustResetPassword`
flag on the user redirects to `/force-password-reset` instead of the
normal dashboard until that flow is completed.

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
