import { useState } from 'react';
import type { DashboardState } from '../scripts/dashboard-api.ts';
import { riskCells } from '../scripts/risk-map.ts';
import type { RehearsalReport } from '../scripts/rehearsal-results.ts';

type Selected = { id: string; report: RehearsalReport };
export function RiskMap({ journeys, runs, investigations }: Pick<DashboardState, 'journeys' | 'runs' | 'investigations'>) {
  const [selected, setSelected] = useState<Record<string, Selected>>({});
  const [opened, setOpened] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const suite = journeys.flatMap(journey => {
    const entry = selected[journey.id];
    return entry ? [{ ...journey, ...entry, cells: riskCells(journey.id, entry.report) }] : [];
  });
  const cells = suite.flatMap(item => item.cells);
  const evaluated = cells.filter(cell => ['Pass', 'Regression', 'Baseline failure'].includes(cell.status)).length;
  const regressions = cells.filter(cell => cell.status === 'Regression').length;
  const profiles = Array.from(new Map(cells.map(cell =>
    [`${cell.journey}/${cell.profile}`, { journey: cell.journey, profile: cell.profile }])).values());
  async function select(journey: string, id: string) {
    setError('');
    setOpened('');
    if (!id) {
      setSelected(items => Object.fromEntries(Object.entries(items).filter(([key]) => key !== journey)));
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/rehearsals/${encodeURIComponent(id)}/report`);
      if (!response.ok) throw new Error('The saved report could not be opened.');
      const report: RehearsalReport = await response.json();
      riskCells(journey, report);
      setSelected(items => ({ ...items, [journey]: { id, report } }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The saved report could not be opened.');
    } finally {
      setLoading(false);
    }
  }
  return <section>
    <h2>Flag Risk Map</h2>
    <p>Choose one saved comparison per journey. Each row represents a journey-specific synthetic profile.</p>
    <fieldset disabled={loading}>
      {journeys.map(journey => <label className="explorer-option" key={journey.id}>{journey.name}{' '}
        <select aria-label={`${journey.name} Risk Map report`} value={selected[journey.id]?.id ?? ''}
          onChange={event => void select(journey.id, event.target.value)}>
          <option value="">Exclude from map</option>
          {runs.filter(item => item.journey === journey.id).map(item =>
            <option value={item.id} key={item.id}>{new Date(item.startedAt).toLocaleTimeString()} · {item.id}</option>)}
        </select></label>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {suite.length > 0 && <>
      <p>{evaluated}/{cells.length} profile comparisons evaluated · {regressions} regressions · {regressions} affected journey-specific profiles</p>
      <p><strong>{cells.length && cells.every(cell => cell.status === 'Pass') ? 'Checks passed' : 'Hold rollout'}</strong></p>
      <div className="table-wrap"><table><caption>Selected journey comparisons</caption>
        <thead><tr><th scope="col">Synthetic profile</th>{suite.map(item => <th scope="col" key={item.id}>{item.name}</th>)}</tr></thead>
        <tbody>{profiles.map(profile => <tr key={`${profile.journey}/${profile.profile}`}>
          <th scope="row">{profile.journey} / {profile.profile}</th>
          {suite.map(item => {
            const cell = item.cells.find(c => c.journey === profile.journey && c.profile === profile.profile);
            const key = `${item.id}/${profile.profile}`;
            return <td key={item.id}>{cell ? <button className={cell.status === 'Regression' ? 'label regression' : 'inspect'}
              aria-expanded={opened === key} onClick={() => setOpened(opened === key ? '' : key)}>{cell.status}</button> : 'Untested'}</td>;
          })}
        </tr>)}</tbody>
      </table></div>
      {suite.flatMap(item => item.cells.filter(cell => opened === `${item.id}/${cell.profile}`).map(cell => {
        const base = `/api/rehearsals/${encodeURIComponent(item.id)}`;
        const flags = cell.proposed?.observedFlags;
        const failure = cell.proposed?.error;
        const links = flags && failure ? investigations.filter(item =>
          item.journey === cell.journey && item.profile === cell.profile &&
          item.step === failure.step && item.message === failure.message &&
          Object.keys(item.flags).length === Object.keys(flags).length &&
          Object.entries(item.flags).every(([name, value]) => flags[name] === value),
        ) : [];
        return <section className="evidence" key={opened}>
          <h3>{item.name} · {cell.profile} · {cell.status}</h3>
          <a href={base + '/report'}>Originating report</a>
          {links.map(link => <p key={`${link.id}/${link.parent}/${link.flag}`}>
            Related observed recovery in an isolated environment · <code>{link.flag}</code>{' '}
            <a href={`/api/explorer/${link.id}/report`}>Explorer report ({link.parent})</a>
          </p>)}
          {(['Current', 'Proposed'] as const).map((name, i) => {
            const result = i ? cell.proposed : cell.current;
            return <div key={name}><h4>{name}</h4>
              <p>{result ? `${result.variant ?? 'Variant unavailable'} · ${result.outcome}` : 'Untested'}</p>
              {result?.flagEvaluation && <p>{result.flagEvaluation.name} · {result.flagEvaluation.enabled ? 'On' : 'Off'}</p>}
              {result?.observedFlags && <p>{JSON.stringify(result.observedFlags)}</p>}
              {result?.remoteValues && <p>{JSON.stringify(result.remoteValues)}</p>}
              {result?.error && <p>{result.error.step} · {result.error.message.split('\n')[0]}</p>}
              {result?.evidence?.screenshot && <a href={base + '/evidence/' + result.evidence.screenshot}>Screenshot</a>}
              {' '}{result?.evidence?.trace && <a href={base + '/evidence/' + result.evidence.trace}>Trace</a>}
            </div>;
          })}
        </section>;
      }))}
    </>}
  </section>;
}
