# Installation

Use Node.js 24 or later with npm, Git, a POSIX shell, and Docker Engine or Docker Desktop with Compose 2.20 or later. The default dashboard and Flagsmith ports are 4175 and 8000, respectively.

```sh
git clone https://github.com/krishh0310/flagsmith-.git
cd flagsmith-
npm run demo
```

Open [Flag Rehearsal](http://127.0.0.1:4175) and choose **Checkout → Run Rehearsal**. The demo installs locked dependencies and Playwright Chromium, starts Flagsmith 2.295.2 and PostgreSQL 15.18, runs migrations, waits for readiness, and seeds the broken Checkout configuration. A subsequent launch with populated SDK keys preserves the saved rule order.

## Environment configuration

Setup creates a Git-ignored `.env` based on [the template](../.env.example). Leave real credentials out of version control.

| Setting | Source |
| --- | --- |
| `POSTGRES_PASSWORD`, `DJANGO_SECRET_KEY`, `FLAGSMITH_ADMIN_PASSWORD` | Generated on first setup |
| `FLAGSMITH_ADMIN_EMAIL` | Local admin account supplied by the template |
| `FLAGSMITH_PORT`, `FLAGSMITH_API_URL` | Local Flagsmith port and SDK endpoint |
| `FLAGSMITH_CURRENT_ENVIRONMENT_KEY`, `FLAGSMITH_PROPOSED_ENVIRONMENT_KEY` | Populated when setup creates or verifies the two environments |
| `REHEARSAL_DASHBOARD_PORT` | Optional shell override for the dashboard port |

Use the local admin email and generated password from `.env` when signing in to the [Flagsmith dashboard](http://localhost:8000).

## Granular setup and troubleshooting

Run these commands from the repository root when you need separate install and startup steps:

```sh
npm ci
npx playwright install --only-shell chromium
npm run setup:demo
npm run dashboard
```

- Start Docker before running the demo. Use `docker compose ps -a` and `docker compose logs --tail=100 postgres migrate-db flagsmith` if readiness fails.
- If Playwright reports missing Chromium system libraries on Linux, run `npx playwright install --with-deps --only-shell chromium`, then rerun setup.
- Stop a competing dashboard listener or set `REHEARSAL_DASHBOARD_PORT` to a free port. To use a different Flagsmith port in a fresh checkout, run `npm run init:demo -- 8016` before setup. For parallel copies, give each a distinct `COMPOSE_PROJECT_NAME` and dashboard port.
- If the SDK keys are missing or stale, run `npm run setup:flagsmith` while Flagsmith is running to refresh them while preserving current targeting.
- To restore the default Checkout sample, run `npm run setup:flagsmith -- broken`. To apply the repaired order directly, run `npm run setup:flagsmith -- fixed`.

Stop the dashboard or preview foreground process with Ctrl+C. Run `docker compose down` from the same project shell to stop Flagsmith and keep its database.

[Back to Flag Rehearsal](../README.md)
