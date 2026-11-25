# Flag Rehearsal · Toggle Wars Track 03

Flag Rehearsal checks a proposed feature-flag rollout by replaying the same Playwright journey for synthetic customers in two environments on self-hosted Flagsmith. The local dashboard and CLI compare checkout outcomes, identify regressions, and retain screenshots and traces that show where a customer got stuck.

The checkout demo catches an override-priority mistake. A paid customer on app version 1 matches both rules. With **Paid plan** first, Flagsmith selects Express and that customer fails session verification. With **Older app version** first, the same customer completes Classic checkout while the newer paid customer still gets Express.

Teams can register target URLs, synthetic identities, and their own Playwright journeys. The example CI workflow runs against an isolated Flagsmith stack, fails on a regression, and preserves the evidence.
