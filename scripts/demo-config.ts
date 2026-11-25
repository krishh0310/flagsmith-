import { loadEnv } from 'vite';
import { environments, type Environment } from './rehearsal-results.ts';

export function readDemoTargets(root: string) {
  function target(environment: Environment) {
    const env = loadEnv(environment.toLowerCase(), root, 'FLAGSMITH_');
    return {
      api: env.FLAGSMITH_API_URL,
      environmentID: env[`FLAGSMITH_${environment.toUpperCase()}_ENVIRONMENT_KEY`],
    };
  }
  return { Current: target('Current'), Proposed: target('Proposed') };
}

export function checkoutPreviewConfig(mode: string, targets: ReturnType<typeof readDemoTargets>) {
  const environment = environments.find((name) => name.toLowerCase() === mode);
  if (!environment) return { environment: null };
  if (targets.Current.environmentID && targets.Current.environmentID === targets.Proposed.environmentID) {
    return { environment, error: 'Current and Proposed use the same Flagsmith SDK key.' };
  }
  return { environment, ...targets[environment] };
}
