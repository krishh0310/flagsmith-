import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DashboardRun, DashboardState } from '../scripts/dashboard-api.ts';
import type { ProfileExplanation } from '../scripts/flag-explanation.ts';
import { environments, flagValueLabel, type CaseResult } from '../scripts/rehearsal-results.ts';
import { RiskMap } from './risk-map.tsx';
import { Explorer } from './explorer.tsx';
import './dashboard.css';

const outcomeLabels = { pass: 'Pass', fail: 'Fail', 'setup-error': 'Setup error' };
const comparisonLabels = {
  pass: 'Pass',
  regression: 'Regression',
  incomplete: 'Incomplete',
  'invalid-baseline': 'Invalid baseline',
};

function FlagDecision({ run, explanation, regression }: {
  run: DashboardRun;
  explanation: ProfileExplanation;
  regression: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const observed = run.report.cases.filter(({ profile }) => profile === explanation.profile);
  const screenshot = observed.find(({ outcome, evidence }) => outcome === 'fail' && evidence?.screenshot)?.evidence?.screenshot;
  const reportBase = `/api/rehearsals/${encodeURIComponent(run.id)}`;

  return (
    <section className="evidence flag-explanation" aria-labelledby="explanation-title">
      <h2 id="explanation-title" ref={heading} tabIndex={-1}>
        {regression ? 'Explain this regression' : 'Explain flag decision'}
      </h2>
      <p><strong>{explanation.profile}</strong> · <code>{run.report.flagExplanation?.flag}</code></p>
      {explanation.status === 'unverified' && (
        <p className="explanation-warning"><strong>Cause unverified.</strong> {explanation.reason}</p>
      )}
      <div className="flag-decisions">
        {environments.map((environment) => {
          const decision = explanation.decisions[environment];
          const result = observed.find((item) => item.environment === environment);
          return (
            <div key={environment}>
              <h3>{environment}</h3>
              <p><strong>{typeof decision.enabled === 'boolean' ? decision.enabled ? 'On' : 'Off' : 'Flag value unavailable'}</strong>
                {' · '}{result?.variant ?? 'Variant unavailable'}{result && ` · ${outcomeLabels[result.outcome]}`}</p>
              {decision.verified && decision.matching.length === 0 && <p className="decision-default">Environment default applied.</p>}
              {decision.matching.length > 0 && (
                <>
                  <h4>Matching overrides in saved priority order</h4>
                  <ol className="rule-list">
                    {decision.matching.map(({ id, name, priority, enabled, condition }) => (
                      <li key={id}>
                        <span className="rule-priority">Priority {priority}</span>
                        <strong>{name}</strong> · {enabled ? 'On' : 'Off'}
                        {condition && <code>{condition.property} {condition.operator === 'EQUAL' ? '=' : '<'} {condition.value}</code>}
                        {decision.winner === id && <span className="label pass">Took precedence</span>}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="explanation-links">
        {screenshot && <a href={`${reportBase}/evidence/${encodeURIComponent(screenshot)}`} target="_blank" rel="noreferrer">Open failure screenshot</a>}
        <a href={`${reportBase}/report`} target="_blank" rel="noreferrer">Open saved run report</a>
      </div>
    </section>
  );
}

function Evidence({ id, result }: { id: string; result: CaseResult }) {
  const { environment, profile, error, evidence } = result;
  const base = `/api/rehearsals/${encodeURIComponent(id)}/evidence/`;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <section className="evidence" aria-labelledby="evidence-title">
      <h2 id="evidence-title" ref={heading} tabIndex={-1}>{profile} in {environment}</h2>
      {error && (
        <dl className="failure-details">
          <dt>Failed step</dt><dd>{error.step}</dd>
          <dt>Error</dt><dd>{error.message}</dd>
        </dl>
      )}
      {evidence?.screenshot && (
        <figure>
          <a href={base + encodeURIComponent(evidence.screenshot)} target="_blank" rel="noreferrer">
            <img src={base + encodeURIComponent(evidence.screenshot)} alt={`Journey failure for ${profile} in ${environment}`} />
          </a>
          <figcaption>Select the screenshot to open it at full size.</figcaption>
        </figure>
      )}
      {evidence?.trace && (
        <div className="trace">
          <a href={base + encodeURIComponent(evidence.trace)} download>Download Playwright trace</a>
          <p>From the directory where you saved the ZIP, run</p>
          <code>npx playwright show-trace --host 127.0.0.1 "{evidence.trace}"</code>
        </div>
      )}
      {evidence?.errors?.map((message) => <p key={message}>{message}</p>)}
    </section>
  );
}

function formatPrice(minor?: number) {
  return minor === undefined ? 'Unavailable' :
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
}

function Comparison({ run }: { run: DashboardRun }) {
  const { id, report } = run;
  const [selected, select] = useState<CaseResult>();
  const [explaining, setExplaining] = useState<string>();
  const explanation = report.flagExplanation?.profiles.find(({ profile }) => profile === explaining);
  const counts = environments.map((environment) =>
    report.cases.filter((item) => item.environment === environment && item.outcome === 'pass').length,
  );
  const total = report.comparisons.length;
  const remoteNames = report.remoteValueNames ?? [];
  const flagNames = report.flagNames ?? [...new Set(report.cases.flatMap(({ observedFlags }) =>
    Object.keys(observedFlags ?? {}),
  ))];

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>{report.journeyName ?? (report.journey === 'checkout' ? 'Checkout' : report.journey ?? 'Checkout')} comparison</caption>
          <thead>
            <tr>
              <th scope="col">Customer profile</th>
              {environments.map((environment, index) => (
                <th scope="col" key={environment}>
                  {environment} <span className="count">{counts[index]}/{total} passed</span>
                </th>
              ))}
              <th scope="col">Comparison</th>
            </tr>
          </thead>
          <tbody>
            {report.comparisons.map(({ profile, status }) => (
              <tr key={profile} className={status === 'regression' ? 'regression-row' : undefined}>
                <th scope="row">
                  <span className="profile-name">{profile}</span>
                </th>
                {environments.map((environment) => {
                  const result = report.cases.find((item) => item.profile === profile && item.environment === environment);
                  return (
                    <td key={environment}>
                      {result ? (
                        <>
                          <span className="variant">{result.variant ?? 'Unavailable'}</span>
                          <span className={`label ${result.outcome}`}>{outcomeLabels[result.outcome]}</span>
                          {result.error && (
                            <button type="button" className="inspect"
                              aria-label={`Inspect ${profile} ${environment} failure`}
                              onClick={() => { setExplaining(undefined); select(result); }}>
                              {result.outcome === 'setup-error' ? 'Inspect setup error' : 'Inspect failure'}
                            </button>
                          )}
                        </>
                      ) : 'Unavailable'}
                      {remoteNames.map(name => {
                        const observation = result?.remoteValues?.[name];
                        const config = report.remoteConfigurations?.[name]?.[environment];
                        return <dl className="observed-flags" key={name}>
                          <dt><code>{name}</code> · SDK value</dt>
                          <dd>{observation?.value == null ? 'Unavailable' : `${JSON.stringify(observation.value)} (${typeof observation.value})`}</dd>
                          {observation?.valid === false && <dd>Invalid value</dd>}
                          <dt>Configured default</dt><dd>{config?.default?.value ?? 'Unavailable'}</dd>
                          <dt>Expected price</dt><dd>{formatPrice(observation?.expectedMinor)}</dd>
                          <dt>Rendered price</dt><dd>{formatPrice(observation?.renderedMinor)}</dd>
                        </dl>;
                      })}
                      {flagNames.length > 0 && (
                        <dl className="observed-flags">
                          {flagNames.map((name) => (
                            <div key={name}>
                              <dt><code>{name}</code></dt>
                              <dd>{flagValueLabel(result?.observedFlags?.[name])}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </td>
                  );
                })}
                <td>
                  <span className={`label ${status}`}>{comparisonLabels[status]}</span>
                  {report.flagExplanation?.profiles.some((item) => item.profile === profile) && (
                    <button type="button" className="inspect" aria-expanded={explaining === profile}
                      onClick={() => { select(undefined); setExplaining(explaining === profile ? undefined : profile); }}>
                      {status === 'regression' ? 'Explain this regression' : 'Explain flag decision'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && <Evidence key={`${selected.environment}-${selected.profile}`} id={id} result={selected} />}
      {explanation && (
        <FlagDecision key={explanation.profile} run={run} explanation={explanation}
          regression={report.comparisons.some(({ profile, status }) => profile === explanation.profile && status === 'regression')} />
      )}
    </>
  );
}

function Dashboard() {
  const [state, setState] = useState<DashboardState>();
  const [journey, setJourney] = useState('');
  const [archived, setArchived] = useState<DashboardRun>();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const revision = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const requestRevision = revision.current;
      try {
        const response = await fetch('/api/rehearsal', { signal: controller.signal });
        if (!response.ok) throw new Error('Status request failed.');
        const status: DashboardState = await response.json();
        if (!controller.signal.aborted && requestRevision === revision.current) {
          setState(status);
        }
      } catch {
        if (!controller.signal.aborted && requestRevision === revision.current) {
          setError('Could not connect to the local rehearsal API.');
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 700);
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  async function start() {
    revision.current++;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/rehearsal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journey: journey || state?.defaultJourney }),
      });
      if (response.status !== 202 && response.status !== 409) {
        const body = await response.json();
        throw new Error(body.error ?? 'Start request failed.');
      }
      setArchived(undefined);
      const status = await fetch('/api/rehearsal');
      if (!status.ok) throw new Error('Status request failed.');
      const snapshot: DashboardState = await status.json();
      revision.current++;
      setState(snapshot);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not start the rehearsal.');
    } finally {
      setSubmitting(false);
    }
  }

  async function openReport(id: string) {
    setError('');
    if (!id) {
      setArchived(undefined);
      return;
    }
    try {
      const response = await fetch(`/api/rehearsals/${encodeURIComponent(id)}/report`);
      if (!response.ok) throw new Error('Report unavailable.');
      setArchived({ id, report: await response.json() });
    } catch {
      setError('Could not open the saved report.');
    }
  }

  const busy = submitting || state?.phase === 'running';
  const run = archived ?? state?.latest;
  const apiError = archived ? undefined : state?.error;
  const runError = apiError || run?.report.runErrors[0];
  const status = busy ? 'Rehearsal running' : apiError ? 'Setup error' : run?.report.exitCode === 0 ? 'All profiles passed' :
    run?.report.exitCode === 1 ? 'Regression detected' : run?.report.exitCode === 2 ?
      (runError || run?.report.cases.some(({ outcome }) => outcome === 'setup-error') ? 'Setup error' : 'Invalid comparison') :
      state ? 'Ready to rehearse' : 'Connecting to the local API';

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <strong>Flag Rehearsal</strong>
          <a href={state?.flagsmithUrl ?? 'http://localhost:8000'} target="_blank" rel="noreferrer">Open Flagsmith</a>
        </div>
      </header>
      <main className="wrap">
        <div className="page-heading">
          <div>
            <h1>Journey rehearsal</h1>
            <p>Compare browser outcomes in Current and Proposed.</p>
          </div>
          <div className="run-controls">
            <div className="journey-picker">
              <label htmlFor="journey">Journey</label>
              <select id="journey" value={journey || state?.defaultJourney || ''} disabled={busy || !state}
                onChange={(event) => setJourney(event.target.value)}>
                {state?.journeys.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <button type="button" className="run" disabled={busy || !state} onClick={start}>
              {busy ? 'Running rehearsal…' : 'Run Rehearsal'}
            </button>
          </div>
        </div>
        <section className="result" data-state={busy ? 'running' : run?.report.exitCode ?? state?.phase}>
          <p className="run-status" role="status">{status}</p>
          {error && <p role="alert">{error}</p>}
          {!busy && runError && <p role="alert">{runError}</p>}
          {!busy && state?.phase === 'empty' && (
            <p className="empty-text">Run a rehearsal to see results and failure evidence for each profile.</p>
          )}
          {busy && run && <p className="empty-text">Showing the previous completed run while this rehearsal runs.</p>}
        </section>
        {state && state.runs.length > 0 && (
          <div className="saved-runs">
            <label htmlFor="saved-run">View report</label>
            <select id="saved-run" disabled={busy} value={archived?.id ?? ''} onChange={(event) => void openReport(event.target.value)}>
              <option value="">Latest run</option>
              {state.runs.map(({ id, name, startedAt }) =>
                <option key={id} value={id}>{name} · {new Date(startedAt).toLocaleTimeString()}</option>)}
            </select>
          </div>
        )}
        {run && <Comparison key={run.id} run={run} />}
        {state && <details className="evidence"><summary>Open Flag Risk Map</summary>
          <RiskMap journeys={state.journeys} runs={state.runs} investigations={state.investigations} />
        </details>}
        <details className="evidence"><summary>Explore flag combinations</summary><Explorer /></details>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Dashboard />);
