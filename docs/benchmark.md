# Checkout timing method

Use a locally seeded broken Checkout rollout and one app source/build configuration. Both methods evaluate the same six Current/Proposed profile cases. For each case record the checkout variant and whether order confirmation is reachable. For the failure keep a screenshot and a Playwright trace. Confirm that both methods identify exactly Proposed / paid-older.

Before timing, run `npm run setup:demo` and `npm run build`, then launch `npm run start:current` and `npm run start:proposed` in separate terminals. Startup, dependency installation, and Flagsmith seeding are setup costs. Keep the previews running throughout the experiment. Run `node scripts/benchmark.ts`.

The timer starts immediately before opening Chromium for the direct browser checklist, or immediately before calling the shared runner for Rehearsal. It ends after the browser closes and the method has recorded the required evidence. Rehearsal rebuilds and starts its own previews as part of each run. The direct checklist uses already running previews and is a lower-bound proxy for elapsed manual browser work. It performs the same UI steps using Playwright without human pauses, flag-rule review, or shared-runner bookkeeping. It cannot measure human hands-on time. Three trials alternate order. Measurements are local elapsed wall time.

## Measured results

| Trial | Order | Direct checklist | Rehearsal |
| --- | --- | ---: | ---: |
| 1 | Checklist, Rehearsal | 1,320 ms | 1,816 ms |
| 2 | Rehearsal, checklist | 1,298 ms | 1,854 ms |
| 3 | Checklist, Rehearsal | 2,980 ms | 5,360 ms |
| Median | | 1,320 ms | 1,854 ms |
| Range | | 1,298–2,980 ms | 1,816–5,360 ms |

Each trial found the same regression and captured the two required artifacts. The Rehearsal median was 534 ms slower than this scripted lower bound. Recorded raw per-case results were written to `rehearsal-runs/benchmark-1795673763044/measurements.json`. These six timings came from one machine and one automation operator. A human timing trial and independent measurements are outstanding.

For a human trial, keep both previews open at the same build and seed. Start the timer before opening the first fresh browser context. In each environment, run free-latest, paid-latest, and paid-older in fresh contexts. Record the displayed variant and whether order confirmation appears. Save a screenshot and trace of the failing case, then stop the timer. Record active interaction time separately from browser, run, or artifact waits. Alternate which method runs first, and retain the individual measurements and evidence.
