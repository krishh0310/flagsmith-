import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { createFlagsmithInstance } from '@flagsmith/flagsmith';
import { readDemoTargets } from './demo-config.ts';
import { environments } from './rehearsal-results.ts';

const targets = readDemoTargets(process.cwd());
async function sample(environment: typeof environments[number], id: string) {
  const { api, environmentID } = targets[environment];
  const sdk = createFlagsmithInstance();
  await sdk.init({ api, environmentID, identity: id, cacheFlags: false,
    fetch: (input: RequestInfo | URL, options?: RequestInit) => fetch(input, { ...options, signal: AbortSignal.timeout(5000) }) });
  const flag = sdk.getAllFlags().pricing_discount;
  assert.equal(flag?.enabled, true);
  assert.ok([0, 10, 20].includes(Number(flag.value)));
  assert.ok(typeof flag.value === 'number' || typeof flag.value === 'string');
  return flag.value;
}
const proof = [];
for (const environment of environments) {
  const observed = new Set<number>();
  for (let i = 1; i <= 128 && observed.size < 3; i++) {
    const id = `pricing-probe-${i}`;
    const value = await sample(environment, id);
    if (observed.has(Number(value))) continue;
    assert.equal(await sample(environment, id), value);
    observed.add(Number(value));
    proof.push({ environment, id, value, repeated: true });
  }
  assert.equal(observed.size, 3, environment + ' did not return all three values within 128 identities.');
}
await mkdir('rehearsal-runs', { recursive: true });
const path = `rehearsal-runs/pricing-assignments-${Date.now()}.json`;
await writeFile(path, JSON.stringify(proof, null, 2) + '\n');
console.log(path, JSON.stringify(proof));
