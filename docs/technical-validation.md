# Technical validation

The paths below name local evidence under the ignored `rehearsal-runs/` directory. The clean-source run used a fresh database and generated its own `.env`.

| Phase | Status | Verification and evidence |
| --- | --- | --- |
| 0 · Baseline and advisories | Implemented and verified | Archived the starting revision and ran the pinned stack, build, type check, unit tests, and Playwright. Both Checkout and Onboarding reproduced exit 1 followed by exit 0. Then upgraded only the compatible direct `@fastify/static` patch. `npm audit --audit-level=moderate` reported zero findings. |
| 1 · Explorer | Implemented and verified | `npm run explore -- onboarding team new_onboarding,save_onboarding_progress` evaluated four combinations with one failure. Adding `show_onboarding_tips` evaluated eight combinations with two failures. The dashboard also ran 24 cases across the three profiles. Cleanup was verified. Pairwise coverage and truncated plans were tested in the planner. |
| 2 · Investigation | Implemented and verified | In `explore-1b8394d1-99e7-4cc4-9f90-581d3cb9fa6b/report.json`, case 2 failed with new flow on and saving off. An original rerun reproduced the failure. Turning saving on preserved the new flow and recovered the journey. Turning off the new flow independently recovered it. Toggling tips alone in the eight-case proof left it failing. |
| 3 · Pricing | Implemented and verified | The fresh isolated run saw 16/16 → 16/16 in Current and 7/16 → 16/16 in Proposed, with CLI exits 1 → 0. Management reads recorded the 35 → 0 Control fix. The out-of-contract SDK value 35 rendered ₹650. `node scripts/verify-pricing-assignments.ts` covered and repeated all three values in both environments. |
| 4 · Risk Map | Implemented and verified | Selected the real broken Checkout report, fixed Onboarding report, and broken Pricing report. The map showed 22/22 evaluated comparisons, 10 regressions affecting 10 journey-specific profiles, and Hold rollout. The Checkout screenshot opened from its originating run. Tests cover missing cases, baseline failure, setup failures, and historical journey identity. |
| 5 · Setup and reuse | Implemented and verified | `npm run demo` started on two fresh source copies. With the first demo listening, the second command rejected the port conflict before generating `.env`. A rerun preserved credentials and fixed checkout. The pinned TodoMVC adapter passed both environments. Independent developer review remains open. See [external validation](real-world-validation.md). |
| 6 · Impact measurement | Scripted timing verified, human trial outstanding | `node scripts/benchmark.ts` ran three alternating paired trials. The browser checklist median was 1,320 ms and the runner median was 1,854 ms. Both produced the required browser evidence. See [method and raw timings](benchmark.md). |
| 7 · CI and release | Implemented and verified locally | `npm run test:integration`, build, type check, 17 unit tests, and 10 Playwright tests passed. Unreachable Flagsmith returned CLI exit 2. In Chromium, a stalled SDK request returned a setup error after 8,445 ms. The external adapter's initial invalid baseline also returned 2. Hosted links below verify the earlier Checkout revision. Running candidate CI on GitHub requires a candidate revision to be pushed. |

## Comparison reports

| Journey | Commands | Broken report | Fixed report |
| --- | --- | --- | --- |
| Checkout | `npm run rehearse` before and after `npm run setup:flagsmith -- fixed` | `run-2026-11-26T06-20-48-429Z-8im193/report.json` · 3/3 vs 2/3 | `run-2026-11-26T06-20-50-944Z-pWOWfY/report.json` · 3/3 vs 3/3 |
| Onboarding | `npm run rehearse -- onboarding` with its two preview servers and the onboarding-broken / onboarding-fixed seeds | `run-2026-11-26T06-20-55-183Z-jZRxWB/report.json` · 3/3 vs 2/3 | `run-2026-11-26T06-20-56-836Z-Z2EWOX/report.json` · 3/3 vs 3/3 |
| Pricing | `npm run rehearse -- pricing` with the pricing-broken / pricing-fixed seeds | `run-2026-11-26T06-21-06-382Z-rS3KwM/report.json` · 16/16 vs 7/16 | `run-2026-11-26T06-21-10-403Z-AH67IZ/report.json` · 16/16 vs 16/16 |

Failure images and traces are next to their reports. The three-flag proof is in `explore-9ca67b80-ffc0-4417-9794-f8a51046c312/report.json`. Pricing assignment evidence is in `pricing-assignments-1795674058668.json`.

## Recovery and hosted evidence

- `node scripts/verify-explorer-failure.ts` injected HTTP 503 after a successful browser case. The partial report retained the case and verified disposal.
- Repeating with `--cleanup-failure` produced a failed cleanup in `explore-3066aa55-205d-4055-b400-068210595993/report.json`. A new process ran `npm run explore -- --recover` and verified the resource was gone. Dashboard cancellation and an overlapping request were also exercised against self-hosted Flagsmith.
- The earlier hosted Checkout workflow used revision `b34d802`. The broken job failed at rehearsal and uploaded its report, screenshot, and trace. The fixed job passed and uploaded its report. [Broken hosted run](https://github.com/krishh0310/flagsmith-/actions/runs/45763576595) · [Fixed hosted run](https://github.com/krishh0310/flagsmith-/actions/runs/45763580691)
- Suggested repository metadata and package scope are in the [release candidate note](release-candidate.md).
