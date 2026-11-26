# Developer guide

Run the commands from the Flag Rehearsal repository root after [local setup](installation.md). Checkout is available in the dashboard and through `npm run rehearse`.

## Onboarding and Explorer

Seed the broken case and keep its two app previews running in one terminal:

```sh
npm run setup:flagsmith -- onboarding-broken
npm run start:onboarding
```

In another terminal:

```sh
npm run rehearse -- onboarding
npm run setup:flagsmith -- onboarding-fixed
npm run rehearse -- onboarding
```

The broken run returns exit 1. In **Proposed**, profile `team` gets the new flow with saving off and cannot continue. The fixed run returns exit 0 with the new flow still on and saving enabled for `team`. You can also select **Onboarding** in the dashboard and click **Run Rehearsal** while the previews run.

Use a fresh demo database for the broken → fixed walkthrough and each integration suite run. On Flagsmith 2.295.2, the Onboarding seed uses PATCH, which retains the existing Paid plan override when the broken seed omits it. To repeat the broken walkthrough on the same database, open Proposed in Flagsmith and remove the **Paid plan** override from `save_onboarding_progress`, keeping the **Older app version** override.

Explorer starts its own preview. From the dashboard, open **Explore flag combinations**, select the profile and flags, click **Preview plan**, then click **Run Explorer**. To use the CLI:

```sh
npm run explore -- onboarding team new_onboarding,save_onboarding_progress --dry-run
npm run explore -- onboarding team new_onboarding,save_onboarding_progress
npm run explore -- onboarding team new_onboarding,save_onboarding_progress,show_onboarding_tips
```

The demo's exhaustive plans produce four and eight combinations respectively for `team`. The planner supports up to eight registered Boolean flags and switches to pairwise coverage above three. API callers may provide a lower plan limit. The defaults cap execution at 16 combinations, 48 planned cases, two attempts per case, 12 investigation cases, and 120 browser attempts in total. The browser and mutation deadline is 180 seconds. Setup, recovery, and disposal make bounded Management API calls outside that browser deadline. When capped, a plan reports uncovered pairs.

The Explorer report records configured and observed values. A mismatch after retries becomes a setup error. A failing case is rerun to confirm the observation before any single-flag changes are tested. Use **Cancel Explorer** or Ctrl+C to stop. Reports remain under `rehearsal-runs/explore-*/`. Run `npm run explore -- --recover` from the same checkout to retry cleanup using recorded ownership.

## Multivariate Pricing

```sh
npm run setup:flagsmith -- pricing-broken
npm run rehearse -- pricing
npm run setup:flagsmith -- pricing-fixed
npm run rehearse -- pricing
node scripts/verify-pricing-assignments.ts
```

The broken CLI run returns exit 1 when a synthetic identity receives the out-of-contract 35% Control value. The fixed run returns exit 0. The probe confirms that each approved value is observable and repeats the observed assignment for the same identity in the same environment. Segment allocation counts vary across independently seeded environments.

## Bring your own application

1. Start reachable Current and Proposed targets for your application.
2. Register their URLs, stable synthetic IDs, optional traits, and a Playwright journey in [`rehearsal.config.ts`](../rehearsal.config.ts). Use the registered name in `npm run rehearse -- <journey-id>`.
3. In your journey, use `setup(step)` for navigation, authentication, or flag evaluation, then `check(step)` for browser assertions. Use `observe(variant)`, `observeFlags(values)`, or `observeRemoteValues(values)` to attach what the app actually saw. The active step is saved with failures. [Journey contract](../scripts/journey.ts) · [Onboarding registration](../examples/onboarding/journey.ts)
4. Adapt the [GitHub Actions workflow](../.github/workflows/flag-rehearsal.yml) to run the comparison against your targets. Keep artifact upload configured to run after a failed check.

The [pinned TodoMVC example](real-world-validation.md) demonstrates two external target URLs without changing the runner. Its upstream notice is preserved.

## Reports and checks

CLI runs write `report.json`, a text summary, and any failure evidence to `rehearsal-runs/`. The dashboard lists its current session's runs. To inspect a downloaded trace, use `npx playwright show-trace /path/to/trace.zip`.

```sh
npm run build
npm run typecheck
node --test tests/*.test.ts
npm run test:e2e
npm run test:integration
```

Keep the seeded Flagsmith stack running for browser and integration checks. Ports 4173 and 4174 are used by the browser suite. The integration suite starts the Onboarding previews on 4181 and 4182 and changes demo flag fixtures. Run it against an isolated demo stack.

[Back to Flag Rehearsal](../README.md)
