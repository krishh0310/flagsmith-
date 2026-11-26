import { createFlagsmithInstance } from '@flagsmith/flagsmith';

const status = document.querySelector<HTMLElement>('#status')!;
const form = document.querySelector('form')!;
const input = document.querySelector('input')!;
async function start() {
  const query = new URLSearchParams(location.search);
  const identity = query.get('id') || 'onboarding-guest';
  const config = await (await fetch('/config.json')).json();
  if (!config.environmentID || !config.api) throw Error(config.error || 'Missing SDK configuration');
  const sdk = createFlagsmithInstance();
  await sdk.init({ environmentID: config.environmentID, api: config.api, identity,
    traits: { plan: query.get('plan') || 'free', app_version: Number(query.get('version') || 2) }, cacheFlags: false });
  const flags = sdk.getAllFlags();
  const newFlow = flags.new_onboarding?.enabled;
  const saving = flags.save_onboarding_progress?.enabled;
  if (typeof newFlow !== 'boolean' || typeof saving !== 'boolean') throw Error('Missing onboarding flags');
  status.textContent = newFlow ? 'New onboarding' : 'Classic onboarding';
  const tips = flags.show_onboarding_tips?.enabled;
  status.dataset.flags = JSON.stringify({ new_onboarding: newFlow, save_onboarding_progress: saving,
    ...(typeof tips === 'boolean' && { show_onboarding_tips: tips }) });
  if (tips) {
    const help = document.createElement('p');
    help.textContent = 'Tip: Choose a workspace name your team will recognize.';
    form.before(help);
  }
  const key = 'onboarding-draft:' + identity;
  function finish(name: string) {
    form.hidden = true;
    status.textContent = 'Workspace ready: ' + name;
    sessionStorage.removeItem(key);
  }
  const draft = sessionStorage.getItem(key);
  if (newFlow && draft) return finish(draft);
  form.hidden = false;
  form.onsubmit = event => {
    event.preventDefault();
    if (!newFlow) return finish(input.value);
    if (!saving) {
      status.textContent = 'Cannot save workspace progress';
      return;
    }
    sessionStorage.setItem(key, input.value);
    location.reload();
  };
}
start().catch(error => { status.textContent = 'Setup error: ' + error.message; });
