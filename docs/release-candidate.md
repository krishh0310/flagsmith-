# Release candidate

**GitHub description**

Compare feature-flag rollouts in real browsers, explain regressions, and explore flag combinations on self-hosted Flagsmith.

**Suggested topics**

`flagsmith`, `feature-flags`, `playwright`, `regression-testing`, `developer-tools`, `self-hosted`

This candidate adds the Combination Explorer with verified single-flag reruns, weighted pricing checks, a Risk Map of explicitly selected comparisons, a clean-clone demo command, and an external TodoMVC adapter. Review the README's earlier hosted Checkout links and rerun CI on the candidate revision before publishing a release.

The supported CLI runs from its source checkout using npm scripts. Its built-in journey registry, Vite entry points, previews, and Compose configuration resolve relative to that checkout. Packaging an installable binary would require defining how it locates both its own assets and a consuming project's registry. The demo currently uses the same workspace entry points for dashboard, CLI, and CI.
