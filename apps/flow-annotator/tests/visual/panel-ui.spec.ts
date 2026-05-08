import { expect, test } from '@playwright/test';

import {
  loadPanelFixture,
  panelFixtureDefinitions,
} from './panel-fixtures';

test.describe('Plugin panel browser visuals', () => {
  for (const definition of panelFixtureDefinitions) {
    test(`${definition.name} renders from the real panel source`, async ({ page }) => {
      await loadPanelFixture(page, definition);

      await expect(page.locator('h1')).toHaveText('Flow Annotator');
      await expect(page.locator('section')).toHaveCount(2);

      if (definition.name === 'eligible-annotation-selection') {
        await expect(page.locator('#createAnnotation')).toBeEnabled();
      } else {
        await expect(page.locator('#createAnnotation')).toBeDisabled();
      }

      if (definition.name === 'two-pending-connector-endpoints') {
        await expect(page.locator('#createConnector')).toBeEnabled();
      } else {
        await expect(page.locator('#createConnector')).toBeDisabled();
      }

      await expect(page.locator('.shell')).toHaveScreenshot(`${definition.name}.png`, {
        animations: 'disabled',
        scale: 'css',
      });
    });
  }
});
