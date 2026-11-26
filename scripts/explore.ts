import { explorerPlan, recoverExplorer, runExplorer } from './explorer.ts';
import { errorMessage } from './rehearsal-results.ts';

const controller = new AbortController();
const cancel = () => controller.abort(new Error('Explorer cancelled.'));
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
try {
  const [journey, profiles, flags, ...options] = process.argv.slice(2);
  if (journey === '--recover' && !profiles) {
    await recoverExplorer();
  } else {
    if (!journey || !profiles || !flags || options.some(option => option !== '--dry-run')) {
      throw new Error('Usage: npm run explore -- <journey> <profile,profile> <flag,flag> [--dry-run]');
    }
    const input = { journey, profiles: profiles.split(','), flags: flags.split(',') };
    console.log(JSON.stringify(explorerPlan(input), null, 2));
    if (!options.includes('--dry-run')) {
      const report = await runExplorer(input, controller.signal);
      console.log(JSON.stringify({ cases: report.cases.map(({ id, result }) => [id, result.profile, result.outcome]),
        cleanup: report.cleanup, errors: report.errors, report: `rehearsal-runs/${report.id}/report.json` }, null, 2));
      process.exitCode = report.exitCode;
    }
  }
} catch (failure) {
  console.error(errorMessage(failure));
  process.exitCode = 2;
} finally {
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
}
