# JC Cattenom App

Web app for the Judo Club Cattenom Rodemack to manage coach and volunteer activity, expenses, mileage, and related club administration.

## What It Does

For coaches and volunteers:
- record training sessions, competition days, and travel entries in a monthly calendar
- track mileage, tolls, hotel costs, and club purchases
- upload supporting receipts for reimbursable expenses
- export monthly timesheets and expense reports

For administrators:
- manage user profiles and role-related data
- review and export activity across profiles
- invite users and perform privileged account actions through Supabase Edge Functions
- inspect audit logs for sensitive operations

## Current Stack

- static SPA in `public/` using HTML, CSS, and ES modules
- no bundler and no build step for the frontend
- modular architecture: `public/app-modular.js` orchestrates ~20 ES modules under `public/modules/`
- Supabase for Auth, Postgres, Storage, and Edge Functions
- GitHub Pages deployment for the frontend
- installable PWA with offline fallback via service worker
- HelloAsso integration for member synchronization

## Repository Layout

- `public/`  frontend, styles, PWA assets, and browser modules
- `supabase/`  config files, SQL migrations, and Edge Functions
- `scripts/`  helper scripts for admin tasks and Supabase deploy/config flows
- `docs/`  project documentation
- `.github/workflows/`  GitHub Pages and Supabase deployment workflows
- `.github/agents/`  custom repo agents for implementation and review workflows

## Local Development

Prerequisites:
- Node.js
- access to the target Supabase projects

Install dependencies:

```bash
npm install
```

Serve the frontend over HTTP from the `public/` directory because the app uses ES modules:

```bash
# Python
cd public && python -m http.server 8000

# Node.js
npx http-server public -p 8000
```

Then open `http://localhost:8000/`.

## Environment Routing

Frontend environment selection is centralized in `public/modules/env.js`.

Resolution order:
- URL parameter `?env=dev|prod` and persisted override (⚠ dev project deprecated, see `docs/legacy-dev-supabase.md`)
- persisted localStorage override `jct.env.override`
- hostname auto-detection

Current hostname behavior:
- `localhost` and `127.0.0.1` use `dev`
- hosts starting with `dev.` or `dev-` use `dev`
- everything else uses `prod`

You can clear a persisted override with:

```text
?env=auto
```

Production frontend host:
- `https://gestion.judo-cattenom.fr/`

Useful URLs:
- `https://gestion.judo-cattenom.fr/` for prod
- `https://test.judo-cattenom.fr/` for test environment (NAS container)

## Supabase Commands

```bash
# Database migrations
npx supabase db push --project-ref ajbpzueanpeukozjhkiv

# Auth/config push
npx supabase config push --project-ref ajbpzueanpeukozjhkiv

# Edge Functions deploy
npx supabase functions deploy <fn-name> --project-ref ajbpzueanpeukozjhkiv
```

## Deployment

Frontend deployment:
- `.github/workflows/deploy-pages.yml` deploys the static app to GitHub Pages
- `public/CNAME` configures the custom domain `gestion.judo-cattenom.fr`

Supabase deployment:
- SQL migrations are applied through the Supabase CLI (see commands above)

Current Edge Functions:
- `alert-admin`
- `app`
- `delete-coach-user`
- `export-monthly-expenses`
- `invite-admin`
- `invite-coach`
- `sync-helloasso`

## Data and Security Notes

- profile and activity data are stored in Supabase Postgres
- receipts are stored in the `justifications` Storage bucket
- Row-Level Security protects direct data access
- privileged account and admin operations go through Edge Functions rather than exposing service-role capabilities to the browser

## Related Docs

- see `docs/technical-architecture.md` for the architecture overview and data model summary
