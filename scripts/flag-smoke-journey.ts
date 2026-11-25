import { expect } from '@playwright/test';
import { openDemoCheckout } from './checkout-journey.ts';
import type { JourneyContext } from './journey.ts';

export async function flagSmoke(context: JourneyContext) {
  await openDemoCheckout(context);
  context.check('Check order summary');
  const summary = context.page.getByRole('complementary', { name: 'Order summary' });
  await expect(summary.getByText('Canvas tote × 1', { exact: true })).toBeVisible();
}
