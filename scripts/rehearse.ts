import { defaultJourney, journeys } from '../rehearsal.config.ts';
import { runRehearsal } from './rehearsal.ts';
import { errorMessage } from './rehearsal-results.ts';

try {
  const journey = process.argv[2] ?? defaultJourney;
  if (!Object.hasOwn(journeys, journey) || process.argv.length > 3) {
    throw new Error(`Usage: npm run rehearse -- [${Object.keys(journeys).join(' | ')}]`);
  }
  const { report, terminal } = await runRehearsal(journey, journeys[journey]);
  console.log(terminal.trimEnd());
  process.exitCode = report.exitCode;
} catch (error) {
  console.error(`Could not finish the rehearsal report. ${errorMessage(error)}`);
  process.exitCode = 2;
}
