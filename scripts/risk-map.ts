import type { CaseResult, RehearsalReport } from './rehearsal-results.ts';

export function riskStatus(current?: CaseResult, proposed?: CaseResult) {
  if (current?.outcome === 'setup-error' || proposed?.outcome === 'setup-error') return 'Setup error';
  if (current?.outcome === 'fail') return 'Baseline failure';
  if (!current || !proposed) return 'Untested';
  return proposed.outcome === 'fail' ? 'Regression' : 'Pass';
}

export function riskCells(journey: string, report: RehearsalReport) {
  if ((report.journey ?? 'checkout') !== journey) throw new Error('Report belongs to a different journey.');
  const profiles = new Set([...report.comparisons.map(c => c.profile), ...report.cases.map(c => c.profile)]);
  return [...profiles].map(profile => {
    const current = report.cases.find(item => item.profile === profile && item.environment === 'Current');
    const proposed = report.cases.find(item => item.profile === profile && item.environment === 'Proposed');
    return { journey, profile, current, proposed, status: riskStatus(current, proposed) };
  });
}
