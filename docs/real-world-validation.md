# External journey validation

The pinned upstream app is [TodoMVC JavaScript ES5](https://github.com/tastejs/todomvc/tree/ff43b02e59dfa604386bb382034b2cd07c2bcd8a/examples/javascript-es5) at `ff43b02e59dfa604386bb382034b2cd07c2bcd8a`. The static files run directly from the clean upstream checkout. [Upstream MIT notice](../examples/todomvc/LICENSE.upstream.md)

From a Flag Rehearsal checkout with dependencies and Chromium installed:

```sh
git clone https://github.com/tastejs/todomvc.git ../todomvc-upstream
git -C ../todomvc-upstream checkout ff43b02e59dfa604386bb382034b2cd07c2bcd8a
node examples/todomvc/serve.ts ../todomvc-upstream
```

In a second terminal:

```sh
npm run rehearse -- todomvc
```

The adapter supplies two loopback URLs, one synthetic identity, and a Playwright journey in [the registry](../rehearsal.config.ts). [Server](../examples/todomvc/serve.ts) · [Journey](../examples/todomvc/journey.ts)

The first attempt failed in both environments with exit `2`. The upstream app uses an in-memory store and discards tasks on reload. The corrected journey creates a task, completes it, checks that Active hides it, then checks that Completed still shows it checked. The rerun passed 1/1 in both environments with exit `0`. Its report was saved at `rehearsal-runs/run-2026-11-26T06-16-01-572Z-AWXPef/report.json`.

Elapsed time from starting the adapter edit to the first passing run was 82 seconds, including a type-check correction and diagnosis of the first browser failure. The upstream checkout was already downloaded when the timer started. This was a self-run portability check against a real external app. Independent feedback and adoption evidence are pending.
