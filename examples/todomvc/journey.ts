import { expect } from '@playwright/test';
import type { JourneyRegistration } from '../../scripts/journey.ts';

export const todomvc: JourneyRegistration = {
  name: 'TodoMVC (external)',
  urls: { Current: 'http://127.0.0.1:4191', Proposed: 'http://127.0.0.1:4192' },
  identities: [{ id: 'todo-editor' }],
  async run({ page, url, setup, check, observe }) {
    setup('Open TodoMVC');
    await page.goto(url);
    const entry = page.getByPlaceholder('What needs to be done?');
    await expect(entry).toBeVisible();
    observe('TodoMVC JavaScript ES5');
    check('Create, complete and filter a task');
    await entry.fill('Rehearse release');
    await entry.press('Enter');
    const item = page.getByRole('listitem').filter({ hasText: 'Rehearse release' });
    await item.getByRole('checkbox').check();
    await page.getByRole('link', { name: 'Active' }).click();
    await expect(item).toHaveCount(0);
    await page.getByRole('link', { name: 'Completed' }).click();
    await expect(item.getByRole('checkbox')).toBeChecked();
  },
};
