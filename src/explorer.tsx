import { useEffect, useState } from 'react';
import type { explorerOptions, ExplorerInput, ExplorerReport } from '../scripts/explorer.ts';
import type { CaseResult } from '../scripts/rehearsal-results.ts';

type Options = ReturnType<typeof explorerOptions>;
async function api<T>(path: string, body?: object) {
  const response = await fetch('/api/explorer' + path, body && {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (response.status === 204 || response.status === 202) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data as T;
}

function Artifacts({ id, result }: { id: string; result: CaseResult }) {
  const path = `/api/rehearsals/${encodeURIComponent(id)}/evidence/`;
  return <>{result.evidence?.screenshot && <a href={path + result.evidence.screenshot}>Screenshot</a>}
    {' '}{result.evidence?.trace && <a href={path + result.evidence.trace}>Trace</a>}</>;
}

export function Explorer() {
  const [options, setOptions] = useState<Options>([]);
  const [input, setInput] = useState<ExplorerInput>({ journey: '', profiles: [], flags: [] });
  const [plan, setPlan] = useState<ExplorerReport['plan']>();
  const [report, setReport] = useState<ExplorerReport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const option = options.find(({ id }) => id === input.journey);
  function select(option: Options[number]) {
    setPlan(undefined);
    setInput({ journey: option.id, flags: [...option.flags], profiles: option.profiles });
  }
  useEffect(() => {
    void api<Options>('').then(items => {
      setOptions(items);
      if (items[0]) select(items[0]);
    }).catch(failure => setError(failure.message));
  }, []);
  async function run(preview: boolean) {
    setError('');
    setBusy(true);
    try {
      if (preview) setPlan(await api<ExplorerReport['plan']>('/plan', input));
      else setReport(await api<ExplorerReport>('', input));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Explorer failed.');
    } finally {
      setBusy(false);
    }
  }
  return <section className="evidence">
    <h2>Flag Combination Explorer</h2>
    <p>Run generated cases in a disposable Flagsmith environment.</p>
    <fieldset disabled={busy}>
      <label>Explorer journey <select value={input.journey} onChange={event =>
        select(options.find(({ id }) => id === event.target.value)!)}>{options.map(({ id, name }) =>
          <option key={id} value={id}>{name}</option>)}</select></label>
      {(['profiles', 'flags'] as const).map(kind => <fieldset key={kind}>
        <legend>{kind === 'profiles' ? 'Profiles' : 'Boolean flags'}</legend>
        {option?.[kind].map(value => <label key={value} className="explorer-option">
          <input type="checkbox" checked={input[kind].includes(value)} onChange={event => {
            setPlan(undefined);
            const selection = event.target.checked ? [...input[kind], value] : input[kind].filter(item => item !== value);
            setInput({ ...input, [kind]: selection });
          }} /> {value}
        </label>)}
      </fieldset>)}
      <button onClick={() => void run(true)}>Preview plan</button>{' '}
      <button disabled={!plan} onClick={() => void run(false)}>Run Explorer</button>
    </fieldset>
    {busy && <button onClick={() => void api('/cancel', {}).catch(failure => setError(failure.message))}>Cancel Explorer</button>}
    {error && <p role="alert">{error}</p>}
    {plan && <div>
      <p>{plan.mode} · {plan.combinations.length}{plan.expectedCombinations && ` of ${plan.expectedCombinations}`} combinations · {plan.cases} browser cases · {plan.complete ? 'Complete coverage for the selected mode' : 'Truncated coverage'}</p>
      <p>{plan.flags.join(', ')}</p>
      <p>Limits: {plan.limits.combinations} combinations, {plan.limits.cases} planned cases, {plan.limits.attempts} attempts per case, {plan.limits.investigations} follow-ups, {plan.limits.totalBrowserAttempts} total browser attempts, {plan.limits.runtimeMs / 1000} seconds.</p>
      {plan.caveat && <p>{plan.caveat}</p>}
      {plan.uncoveredPairs.length > 0 && <details><summary>Uncovered pairs ({plan.uncoveredPairs.length})</summary>
        <ul>{plan.uncoveredPairs.map(pair => <li key={pair}>{pair}</li>)}</ul></details>}
    </div>}
    {report && <div>
      <h3>Explorer results</h3>
      <p>{report.cases.length}/{report.plan.cases} cases · Cleanup {report.cleanup.status} · {report.cleanup.resource}</p>
      {report.errors.map((message, i) => <p key={i}>{message}</p>)}
      <ul>{report.cases.map(item => <li key={item.id}>
        <details><summary>{item.id} · {item.result.profile} · {item.result.outcome}</summary>
          <p>Configured {JSON.stringify(item.configured)}</p>
          <p>Observed {JSON.stringify(item.result.observedFlags) ?? 'Unavailable'}</p>
          {item.result.error && <p>{item.result.error.step} · {item.result.error.message}</p>}
          <Artifacts id={report.id} result={item.result} />
          <ul>{report.investigations.filter(link => link.parent === item.id).map(link => <li key={link.attempt.id}>
            {link.attempt.id} · {link.flag ? `Changed ${link.flag} ${item.configured[link.flag]} → ${link.attempt.configured[link.flag]}` : 'Original combination'} · {link.status}
            <p>Observed {JSON.stringify(link.attempt.result.observedFlags) ?? 'Unavailable'} · {link.attempt.result.outcome}</p>
            {link.attempt.result.error && <p>{link.attempt.result.error.step} · {link.attempt.result.error.message}</p>}
            <Artifacts id={report.id} result={link.attempt.result} />
          </li>)}</ul>
        </details>
      </li>)}</ul>
    </div>}
  </section>;
}
