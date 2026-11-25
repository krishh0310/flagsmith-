# Flag Rehearsal

Flag Rehearsal runs the same browser journey against Current and Proposed configurations in self-hosted Flagsmith so developers can catch checkout regressions before rollout.

A flag change can leave the application build untouched and still send some customers down a broken path. The demo shows a paid customer on app version 1 getting Express checkout and failing session verification. Reordering two Flagsmith overrides restores Classic for that customer while newer paid customers keep Express.

Toggle Wars Track 03 · Build on Open Source Flagsmith. [Track overview](https://www.wemakedevs.org/hackathons/flagsmith) · [Submission rules](https://www.wemakedevs.org/hackathons/flagsmith/rules) · [Project summary](SUBMISSION.md)

## Quick start

Install **Node.js 24 with npm** and start **Docker Engine with Compose v2.20+**. Keep ports **8000** and **4175** free. On Linux, add `--with-deps` to the Playwright install command if Chromium needs system packages.

From a fresh clone, run:

```sh
npm ci
npx playwright install --only-shell chromium
npm run init:demo
docker compose up -d --wait --wait-timeout 240
npm run setup:flagsmith -- broken
npm run dashboard
```

- `init:demo` creates a Git-ignored `.env` with local credentials. Reuse an existing `.env` by skipping this command.
- Compose starts Flagsmith 2.295.2 and PostgreSQL 15.18, runs migrations, and waits for the health check. Seeding creates the demo project, environments, flag, and overrides. It prints **SDK endpoint verified** for both environments and saves the client-side SDK keys to `.env`. Initial setup needs no manual Flagsmith changes. For an existing Flagsmith instance, set `FLAGSMITH_ADMIN_EMAIL` and `FLAGSMITH_ADMIN_PASSWORD` in `.env` before seeding.
- Open [Flag Rehearsal](http://127.0.0.1:4175) and click **Run Rehearsal**. The broken order shows **Current 3/3** and **Proposed 2/3**. For the same rehearsal from a terminal, run `npm run rehearse` from the project root.

[Flagsmith](http://localhost:8000) is where you change override priority. If startup fails, check `docker compose ps -a`, `docker compose logs --tail=100 postgres migrate-db flagsmith`, and `curl -fsS http://localhost:8000/health/liveness/`. If SDK keys are missing or duplicated, clear any shell or Vite mode overrides and run `npm run setup:flagsmith` to refresh `.env` while preserving the rule order.

To run alongside another copy, use `npm run init:demo -- 8016` in the fresh copy, set a unique `COMPOSE_PROJECT_NAME` in that shell, and launch the dashboard with `REHEARSAL_DASHBOARD_PORT=4185 npm run dashboard`. Use `docker compose down` to stop the stack and keep its database volume. Stop the dashboard with Ctrl+C.

## Reproduce and fix the regression

The Boolean flag `express_checkout` defaults to **Off** in both environments. Current has no overrides. Proposed starts with two overlapping overrides in this order:

| Priority | Override | Condition | Flag |
| --- | --- | --- | --- |
| 0 | Paid plan | `plan = paid` | On |
| 1 | Older app version | `app_version < 2` | Off |

Flagsmith uses the first matching override. Both match `paid-older`, so the broken order gives that customer Express. Express requires a session capability introduced in app version 2. [Flagsmith segment precedence](https://docs.flagsmith.com/flagsmith-concepts/segments#multiple-segment-overrides-for-one-feature)

1. With the broken order, click **Run Rehearsal** or run `npm run rehearse`. In the dashboard, click **Explain this regression** for `paid-older` to see that **Paid plan** took precedence. Open the failure screenshot. **Inspect failure** shows the **Verify Express session** error and offers the Playwright trace.
2. In [Flagsmith](http://localhost:8000), sign in with the local admin credentials from `.env`. Open **Toggle Wars → Flag Rehearsal → Environments** and select **Proposed** in the left sidebar. Open **Features → express_checkout → Segment Overrides**.
3. Drag **Older app version** by its name above **Paid plan**. Keep **Older app version** Off and **Paid plan** On. Click **Update Segment Overrides** and wait for the save to finish.
4. Rerun with the same dashboard button or CLI command. To repeat, move **Paid plan** back to the top and save. The demo seed also supports `npm run setup:flagsmith -- fixed` and `npm run setup:flagsmith -- broken`.

Observed on a fresh local stack:

| Profile | Traits | Current, both runs | Proposed, broken | Proposed, fixed |
| --- | --- | --- | --- | --- |
| `free-latest` | Free, app v2 | Classic · pass | Classic · pass | Classic · pass |
| `paid-latest` | Paid, app v2 | Classic · pass | Express · pass | Express · pass |
| `paid-older` | Paid, app v1 | Classic · pass | Express · fails at **Verify Express session** | Classic · pass |
| **Total** | | **3/3** | **2/3** | **3/3** |

| CLI exit | Meaning |
| --- | --- |
| `0` | Both environments pass for every profile. |
| `1` | A valid comparison found a Proposed regression after a Current pass. |
| `2` | Setup failed, the comparison was incomplete, or Current was invalid. |

The CLI prints the report path. Each run keeps its own `report.json`, `summary.txt`, and any failure screenshots and trace ZIPs in `rehearsal-runs/run-*/`. To open a trace, run `npx playwright show-trace --host 127.0.0.1 path/to/trace.zip` and open the printed address if needed. The dashboard serves only evidence listed for runs it started in that session. Files remain on disk after a restart.

## How Flagsmith and the runner work

1. Playwright opens a fresh browser context for each profile and environment. The same checkout build runs twice with different client SDK keys. The app passes the selected synthetic identity, `plan`, and numeric `app_version` to the Flagsmith JavaScript SDK.
2. The SDK evaluates `express_checkout` against self-hosted Flagsmith. Checkout renders Classic for Off and Express for On. An unavailable evaluation shows a setup error.
3. Playwright reads the rendered variant, follows the checkout, and checks for **Order confirmed**. The CLI and local dashboard call the same runner, which compares outcomes and records failure evidence.

The explanation panel compares Flagsmith override snapshots taken before and after the run with the SDK’s reason and the variant actually rendered. If they cannot be reconciled, the panel keeps the observed result and shows **Cause unverified**. Use **Open saved run report** to revisit the original explanation after rerunning.

## Reuse it in another project

Run the included [flag-smoke journey](scripts/flag-smoke-journey.ts):

```sh
npm run rehearse -- flag-smoke
```

It checks the evaluated variant and order summary through the bundled previews. It does not place an order, so it can pass for a profile whose checkout fails.

To try explicit target URLs, run `npm run build`, then start `npm run start:current` and `npm run start:proposed` in separate terminals. Add this entry to `journeys` in [rehearsal.config.ts](rehearsal.config.ts), where `flagSmoke` is already imported:

```ts
'preview-smoke': {
  urls: {
    Current: 'http://127.0.0.1:4173',
    Proposed: 'http://127.0.0.1:4174',
  },
  identities: [{ id: 'paid-latest', traits: { plan: 'paid', app_version: 2 } }],
  run: flagSmoke,
},
```

Run `npm run rehearse -- preview-smoke`. For your own app, replace the URLs and synthetic identities and register a journey that applies those identities using your app’s sign-in or test interface. See the [journey contract](scripts/journey.ts) for `setup(step)`, `check(step)`, and `observe(variant)`. Journey errors record the active step. Keep customer data out of traces by using synthetic identities.

### CI

The [GitHub Actions workflow](.github/workflows/flag-rehearsal.yml) starts an isolated Flagsmith stack, seeds Proposed, and runs `npm run rehearse`. Pull requests use the fixed demo order. To exercise both outcomes, use **Actions → Flag Rehearsal → Run workflow** and choose `broken` or `fixed`. Any nonzero exit fails the check. The upload step runs even after failure. In the run’s **Artifacts** section, look for `flag-rehearsal-broken` or `flag-rehearsal-fixed` for the JSON report, summary, and any screenshots and traces.

To adapt the workflow, replace demo seeding with your Flagsmith setup, apply the candidate configuration to Proposed, and run your registered journey against the two app URLs. Keep the CLI exit status and the artifact step. For shared infrastructure, put management credentials in CI secret storage. The broken and fixed commands were verified locally against fresh self-hosted Flagsmith. Hosted execution and upload are unverified.

### Developer checks

```sh
npm run build
npm run typecheck
node --test tests/*.test.ts
npm run test:e2e
```

The browser suite uses the running seeded Flagsmith instance and checkout previews on ports 4173 and 4174.

## License

Flag Rehearsal is available under the [MIT License](LICENSE).
