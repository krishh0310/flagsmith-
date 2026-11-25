import { createFlagsmithInstance } from '@flagsmith/flagsmith';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { profileIds, profiles, type Profile } from './profiles.ts';
import './styles.css';

type RuntimeConfig = {
  environment: 'Current' | 'Proposed';
  api: string;
  environmentID: string;
};
type Evaluation =
  | { state: 'loading' }
  | { state: 'ready'; express: boolean; reason?: string; traits: string }
  | { state: 'error'; message: string };
type Step = 'start' | 'verify' | 'blocked' | 'review' | 'complete';

async function loadConfig(): Promise<RuntimeConfig> {
  const response = await fetch('/checkout-config.json', { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error('Configuration request failed.');
  const config = await response.json();
  if (typeof config?.error === 'string') throw new Error(config.error);
  if (
    (config?.environment !== 'Current' && config?.environment !== 'Proposed') ||
    typeof config.api !== 'string' || !config.api ||
    typeof config.environmentID !== 'string' || !config.environmentID
  ) {
    throw new Error('Check the Flagsmith settings in .env and restart the preview.');
  }
  return config;
}

const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(8_000) });

async function evaluateCheckout(config: RuntimeConfig, profile: Profile) {
  const flagsmith = createFlagsmithInstance();
  try {
    await flagsmith.init({
      environmentID: config.environmentID,
      api: config.api,
      identity: profile,
      traits: profiles[profile],
      cacheFlags: false,
      fetch: fetchWithTimeout,
    });
  } catch {
    return { state: 'error', message: 'Flagsmith could not evaluate this customer. Check the local API and SDK key.' } as const;
  }

  const flag = flagsmith.getAllFlags().express_checkout;
  if (typeof flag?.enabled !== 'boolean') {
    return { state: 'error', message: 'express_checkout is missing or invalid in this environment.' } as const;
  }
  const traits = { plan: flagsmith.getTrait('plan'), app_version: flagsmith.getTrait('app_version') };
  return { state: 'ready', express: flag.enabled, reason: flag.reason, traits: JSON.stringify(traits) } as const;
}

function Checkout({ config, profile }: { config: RuntimeConfig | null; profile: Profile | '' }) {
  const [evaluation, setEvaluation] = useState<Evaluation>({ state: 'loading' });
  const [step, setStep] = useState<Step>('start');

  useEffect(() => {
    if (!config || !profile) return;
    let active = true;
    void evaluateCheckout(config, profile).then((result) => {
      if (active) setEvaluation(result);
    });
    return () => { active = false; };
  }, [config, profile]);

  const ready = evaluation.state === 'ready';
  const express = ready && evaluation.express;
  const supportsExpressSession = profile !== '' && profiles[profile].app_version >= 2;
  const title = ready ? express ? 'Express checkout' : 'Classic checkout' : 'Checkout';

  return (
    <section className="checkout" aria-labelledby="variant"
      data-flag-name={ready ? 'express_checkout' : undefined}
      data-flag-enabled={ready ? express : undefined}
      data-flag-reason={ready ? evaluation.reason : undefined}
      data-flag-traits={ready ? evaluation.traits : undefined}>
      <h1 id="variant">{title}</h1>
      {evaluation.state === 'error' && <p role="alert">Setup error. {evaluation.message}</p>}
      {evaluation.state === 'loading' && profile && config &&
        <p role="status">Evaluating express_checkout for {profile}…</p>}
      {step === 'start' && (
        <button disabled={!ready} onClick={() => setStep(express ? 'verify' : 'review')}>
          Continue to review
        </button>
      )}
      {(step === 'verify' || step === 'blocked') && (
        <div>
          <h2>Verify Express session</h2>
          <p>Express uses a session token supported by app version 2 and later.</p>
          {step === 'blocked' ? (
            <p role="alert">Express session verification failed. App version 2 or later is required.</p>
          ) : (
            <button onClick={() => setStep(supportsExpressSession ? 'review' : 'blocked')}>
              Verify Express session
            </button>
          )}
        </div>
      )}
      {step === 'review' && (
        <div>
          <h2>Review order</h2>
          <p>Confirm the demo order for one canvas tote.</p>
          <button onClick={() => setStep('complete')}>Place demo order</button>
        </div>
      )}
      {step === 'complete' && (
        <div role="status">
          <h2>Order confirmed</h2>
          <p>Your demo order is complete.</p>
        </div>
      )}
    </section>
  );
}

function App() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [profile, setProfile] = useState<Profile | ''>('');

  useEffect(() => {
    void loadConfig().then(setConfig, (error: unknown) => {
      setConfigError(error instanceof Error ? error.message : 'Configuration request failed.');
    });
  }, []);

  return (
    <>
      <header className="masthead">
        <div><strong>Flag Rehearsal</strong><span>Checkout demo</span></div>
        {config && <span className="environment">{config.environment}</span>}
      </header>
      <main>
        <div className="profile">
          <label htmlFor="profile">Customer profile</label>
          <select id="profile" value={profile}
            onChange={(event) => setProfile(event.currentTarget.value as Profile | '')}>
            <option value="">Choose a profile</option>
            {profileIds.map((id) => <option key={id}>{id}</option>)}
          </select>
          {profile && <p>{profiles[profile].plan} plan · app version {profiles[profile].app_version}</p>}
          {configError && <p role="alert">Setup error. {configError}</p>}
        </div>
        <div className="details">
          <Checkout key={profile} config={config} profile={profile} />
          <aside aria-labelledby="order-summary">
            <h2 id="order-summary">Order summary</h2>
            <dl>
              <div><dt>Canvas tote × 1</dt><dd>$24.00</dd></div>
              <div><dt>Total</dt><dd>$24.00</dd></div>
            </dl>
            <p>Simulated order. No payment required.</p>
          </aside>
        </div>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
