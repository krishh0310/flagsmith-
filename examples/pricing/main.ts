import { createFlagsmithInstance } from '@flagsmith/flagsmith';
import '../../src/styles.css';

const status = document.querySelector<HTMLElement>('[role=status]')!;
const price = document.querySelector<HTMLElement>('#price')!;

async function renderPrice() {
  const id = new URLSearchParams(location.search).get('id') ?? 'pricing-guest';
  const config = await (await fetch('/checkout-config.json')).json();
  if (!config.environmentID || !config.api) throw Error(config.error ?? 'Missing SDK configuration');
  const sdk = createFlagsmithInstance();
  await sdk.init({ environmentID: config.environmentID, api: config.api, identity: id, cacheFlags: false });
  const flag = sdk.getAllFlags().pricing_discount;
  const discount = flag?.value;
  const numeric = typeof discount === 'number' ? discount :
    typeof discount === 'string' && /^-?\d+$/.test(discount) ? Number(discount) : NaN;
  if (flag?.enabled && Number.isSafeInteger(numeric) && Math.abs(numeric) <= 1000) {
    const minor = 100_000 - 1000 * numeric;
    price.dataset.minor = String(minor);
    price.textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
  }
  status.dataset.observed = JSON.stringify({ enabled: flag?.enabled, value: discount });
  status.textContent = price.textContent ? 'Price calculated' : 'Price unavailable';
}
renderPrice().catch(error => { status.textContent = 'Setup error: ' + error.message; });
