# Flag Rehearsal

Flag Rehearsal helps developers replay the same browser journeys against current and proposed Flagsmith configurations, so they can see which customers would hit a regression and why.

**[Run the demo locally →](#run-locally)** · Toggle Wars Track 03 · Build on Open Source Flagsmith

![The regression explanation shows paid-older passing Classic checkout in Current and failing Express in Proposed because Paid plan took precedence over Older app version](docs/screenshots/matching-rules.png)

## 60-second demo

Once the [local dashboard](http://127.0.0.1:4175) is up, use the seeded Checkout scenario.

1. Select **Checkout** in **Journey**, then click **Run Rehearsal**. **Current** passes 3/3 and **Proposed** passes 2/3. Only `paid-older` fails.
2. On the `paid-older` row, click **Explain this regression**. Both rules match, and **Paid plan** says **Took precedence**. Click **Open failure screenshot** to see where the older client gets stuck at **Verify Express session**.
3. Click **Open Flagsmith** and sign in with the local admin email and password from `.env`. In **Flag Rehearsal**, open **Environments**, choose **Proposed**, then open **Features → express_checkout → Segment Overrides**. Drag **Older app version** above **Paid plan** by its name and click **Update Segment Overrides**. Keep the two overrides set to **Off** and **On**, respectively.
4. Return to Flag Rehearsal and click **Run Rehearsal** again. **Both environments now pass 3/3.** The older paid customer completes Classic checkout, and the newer paid customer still gets Express. You fixed the regression by changing the rule order alone.

To reset the sample for another demo, run `npm run setup:flagsmith -- broken` from the repo root while Flagsmith is running.

## Why we built it

Imagine rolling out a faster checkout to paid customers. A feature flag is a setting that lets you choose who sees a feature without redeploying the app. Here, `express_checkout` sends a customer to Express when it’s on and Classic when it’s off. One rule turns it on for paid users. Another turns it off for older clients that lack Express session support. A paid customer on an older client matches both.

Flag Rehearsal runs the journey with three synthetic customers and shows who finishes checkout under each configuration. In the demo, the rule editor tells you which rule is first. The rehearsal shows which customer it affects, the exact browser step that breaks, and whether your fix preserves the rollout for everyone else in the sample.

## Run locally

**Prerequisites** · Node.js 24 or later with npm, a running Docker Engine or Docker Desktop with Compose 2.20 or later, and free local ports `4175` and `8000`. Use a POSIX shell.

From the root of a fresh clone, install and start the demo with:

```sh
npm run demo
```

The command installs the locked npm dependencies and Chromium, starts Flagsmith and PostgreSQL, waits for migrations, seeds the broken Checkout scenario, and starts the dashboard. Open the [Flag Rehearsal dashboard](http://127.0.0.1:4175). The [Flagsmith dashboard](http://localhost:8000) is used to edit the rule order. If Playwright reports missing Chromium system libraries on Linux, run `npx playwright install --with-deps --only-shell chromium` from the repo root and retry.

A fresh clone needs no environment variables entered by hand. Setup creates a Git-ignored `.env` using [the example configuration](.env.example). These are the settings used by the local stack:

| Settings | How they are populated |
| --- | --- |
| `POSTGRES_PASSWORD`, `DJANGO_SECRET_KEY`, `FLAGSMITH_ADMIN_PASSWORD` | Generated locally on first setup |
| `FLAGSMITH_ADMIN_EMAIL` | Provided by the template. Use it with the generated password when signing in to Flagsmith. |
| `FLAGSMITH_PORT`, `FLAGSMITH_API_URL` | Point to the local Flagsmith service on port 8000 by default |
| `FLAGSMITH_CURRENT_ENVIRONMENT_KEY`, `FLAGSMITH_PROPOSED_ENVIRONMENT_KEY` | Written by the seed script after provisioning both environments |

When the SDK keys already exist, `npm run demo` reuses the saved configuration and preserves the rule order. Stop the dashboard with **Ctrl+C**, then run `docker compose down` from the repo root to stop the stack and retain its database.

### Run from the terminal

With Flagsmith running, use a second terminal at the repo root:

```sh
npm run rehearse
```

Exit `0` means all cases passed, `1` means Proposed introduced a regression, and `2` means the comparison was invalid or incomplete. Reports, failure screenshots, and Playwright traces are saved under `rehearsal-runs/`. In the dashboard, **Inspect failure** opens the evidence and **View report** reopens earlier runs from the current dashboard session.

## How it works

1. **Choose a journey and profiles.** The default Checkout journey uses `free-latest`, `paid-latest`, and `paid-older`, each with a plan and app version. You can register your own target URLs, synthetic profiles, and browser steps. [Journey registry](rehearsal.config.ts) · [External TodoMVC example](docs/real-world-validation.md)
2. **Evaluate real flags.** The same checkout build runs against separate Current and Proposed environments on self-hosted Flagsmith. Its JavaScript SDK evaluates `express_checkout` for the synthetic identity. Playwright uses a fresh Chromium context for each case and checks whether the customer reaches **Order confirmed**.
3. **Compare and inspect.** The local dashboard and CLI share the runner. A regression is a journey that passes in Current and fails in Proposed. The checkout explanation compares saved Flagsmith rule snapshots with the SDK decision and rendered checkout. When it cannot verify the cause, it shows **Cause unverified** alongside the observed outcome.

Beyond Checkout, **Explore flag combinations** generates and tests flag assignments for Onboarding in a disposable Flagsmith environment, including single-flag reruns to investigate failures. **Pricing** checks remote discounts against approved prices. The **Flag Risk Map** compares selected saved reports. [Commands, results, and evidence](docs/technical-validation.md)

## Project status and credits

- **Demo scope.** Run the dashboard locally against the seeded Flagsmith stack with synthetic profiles. Checkout is ready on first startup. For the standalone Onboarding comparison, run `npm run setup:flagsmith -- onboarding-broken` and `npm run start:onboarding` in a second terminal. For Pricing, run `npm run setup:flagsmith -- pricing-broken` before selecting **Pricing**. [Additional demo commands](docs/technical-validation.md)
- **CI evidence.** The hosted Checkout runs verified the broken and fixed outcomes on commit `b34d802`. The newer integration suite was verified locally. [Broken hosted run](https://github.com/krishh0310/flagsmith-/actions/runs/45763576595) · [Fixed hosted run](https://github.com/krishh0310/flagsmith-/actions/runs/45763580691) · [Workflow](.github/workflows/flag-rehearsal.yml)
- **Credits.** Built by Sai Krish Karthik for **Toggle Wars Track 03**. Flag Rehearsal is available under the MIT License. The external reuse example preserves TodoMVC’s upstream notice. [Project submission summary](SUBMISSION.md) · [MIT License](LICENSE) · [TodoMVC notice](examples/todomvc/LICENSE.upstream.md)
