import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DashboardRun, DashboardState } from '../scripts/dashboard-api.ts';
import type { ProfileExplanation } from '../scripts/flag-explanation.ts';
import { environments, type CaseResult } from '../scripts/rehearsal-results.ts';
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
            <img src={base + encodeURIComponent(evidence.screenshot)} alt={`Checkout failure for ${profile} in ${environment}`} />
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

function Comparison({ run }: { run: DashboardRun }) {
  const { id, report } = run;
  const [selected, select] = useState<CaseResult>();
  const [explaining, setExplaining] = useState<string>();
  const explanation = report.flagExplanation?.profiles.find(({ profile }) => profile === explaining);
  const counts = environments.map((environment) =>
    report.cases.filter((item) => item.environment === environment && item.outcome === 'pass').length,
  );
  const total = report.comparisons.length;

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>Checkout comparison</caption>
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
                              Inspect failure
                            </button>
                          )}
                        </>
                      ) : 'Unavailable'}
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
          setError('');
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
      const response = await fetch('/api/rehearsal', { method: 'POST' });
      if (response.status !== 202 && response.status !== 409) throw new Error('Start request failed.');
      const status = await fetch('/api/rehearsal');
      if (!status.ok) throw new Error('Status request failed.');
      const snapshot: DashboardState = await status.json();
      revision.current++;
      setState(snapshot);
    } catch {
      setError('Could not start the rehearsal. Check that the local API is running.');
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || state?.phase === 'running';
  const run = state?.latest;
  const runError = state?.error || run?.report.runErrors[0];
  const status = busy ? 'Rehearsal running' : run?.report.exitCode === 0 ? 'All profiles passed' :
    run?.report.exitCode === 1 ? 'Regression detected' : state?.phase === 'setup-error' ?
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
            <h1>Checkout rehearsal</h1>
            <p>Run the same checkout journey in Current and Proposed.</p>
          </div>
          <button type="button" className="run" disabled={busy || !state} onClick={start}>
            {busy ? 'Running rehearsal…' : 'Run Rehearsal'}
          </button>
        </div>
        <section className="result" data-state={busy ? 'running' : run?.report.exitCode ?? state?.phase}>
          <p className="run-status" role="status">{status}</p>
          {error && <p role="alert">{error}</p>}
          {!busy && runError && <p role="alert">{runError}</p>}
          {!busy && state?.phase === 'empty' && (
            <p className="empty-text">Run a rehearsal to see checkout results and failure evidence for all three profiles.</p>
          )}
          {busy && run && <p className="empty-text">Showing the previous completed run while this rehearsal runs.</p>}
        </section>
        {run && <Comparison key={run.id} run={run} />}
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Dashboard />);
