export const explorerLimits = { combinations: 16, cases: 48, attempts: 2, investigations: 12, totalBrowserAttempts: 120, runtimeMs: 180_000 };
export type BooleanFlags = Record<string, boolean>;

export function planCombinations(flags: readonly string[], profiles: number, limit = explorerLimits.combinations) {
  if (!flags.length || flags.length > 8 || new Set(flags).size !== flags.length ||
      !Number.isInteger(profiles) || profiles < 1 || profiles > explorerLimits.cases ||
      !Number.isInteger(limit) || limit < 1) throw new Error('Invalid Explorer plan bounds.');
  const mode = flags.length <= 3 ? 'exhaustive' : 'pairwise';
  const candidates = Array.from({ length: 2 ** flags.length }, (_, bits) =>
    Object.fromEntries(flags.map((flag, i) => [flag, Boolean(bits & (1 << i))])));
  const pairs = (values: BooleanFlags) => flags.flatMap((a, i) =>
    flags.slice(i + 1).map(b => `${a}=${values[a]}, ${b}=${values[b]}`));
  const uncovered = new Set(candidates.flatMap(pairs));
  const combinations: BooleanFlags[] = [];
  const budget = Math.min(limit, explorerLimits.combinations, Math.floor(explorerLimits.cases / profiles));
  while (candidates.length && combinations.length < budget && (mode === 'exhaustive' || uncovered.size)) {
    let best = 0;
    if (mode === 'pairwise') {
      let score = -1;
      for (const [index, candidate] of candidates.entries()) {
        const covered = pairs(candidate).filter(pair => uncovered.has(pair)).length;
        if (covered > score) {
          best = index;
          score = covered;
        }
      }
    }
    const [selected] = candidates.splice(best, 1);
    combinations.push(selected);
    for (const pair of pairs(selected)) uncovered.delete(pair);
  }
  return {
    flags: [...flags], mode, combinations, cases: combinations.length * profiles, limits: explorerLimits,
    expectedCombinations: mode === 'exhaustive' ? 2 ** flags.length : undefined,
    uncoveredPairs: [...uncovered], complete: mode === 'exhaustive' ? !candidates.length : !uncovered.size,
    caveat: mode === 'pairwise' ? 'Pairwise coverage can miss higher-order interactions.' : undefined,
  };
}
