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
      await expect(page.locator('.tab')).toHaveText(['Annotate', 'Connect', 'Validate']);
      await expect(page.locator('section')).toHaveCount(3);

      if (definition.name === 'eligible-annotation-selection') {
        await expect(page.locator('#createAnnotation')).toBeEnabled();
      } else {
        await expect(page.locator('#createAnnotation')).toBeDisabled();
      }

      if (definition.name === 'add-subject-selection') {
        await expect(page.locator('#addSubjectNodes')).toBeEnabled();
      } else {
        await expect(page.locator('#addSubjectNodes')).toBeDisabled();
      }

      if (
        definition.name === 'two-pending-connector-endpoints' ||
        definition.name === 'existing-connector-status'
      ) {
        await expect(page.locator('#createConnector')).toBeEnabled();
        await expect(page.locator('#refreshConnectors')).toBeEnabled();
      } else {
        await expect(page.locator('#createConnector')).toBeDisabled();
      }

      if (definition.name === 'validate-report') {
        await expect(page.locator('#summaryAll')).toHaveText('3');
        await expect(page.locator('.issue-row')).toHaveCount(3);
        await expect(page.locator('#cleanStaleIndexes')).toBeDisabled();
        await page.locator('[data-filter="warning"]').click();
        await expect(page.locator('.issue-row')).toHaveCount(1);
        await expect(page.locator('.issue-title')).toHaveText('Missing Annotation Badge');
        await page.locator('[data-filter="all"]').click();
      }

      if (definition.name === 'validate-connector-report') {
        await expect(page.locator('#summaryAll')).toHaveText('5');
        await expect(page.locator('#summaryErrors')).toHaveText('3');
        await expect(page.locator('#summaryWarnings')).toHaveText('2');
        await expect(page.locator('#cleanStaleIndexes')).toBeEnabled();
        await expect(page.locator('.issue-title')).toHaveText([
          'Orphaned Flow Connector',
          'Invalid Flow Endpoint',
          'Duplicate Flow Connector',
          'Empty Flow Action',
          'Stale Reverse Index',
        ]);
        await page.locator('[data-filter="warning"]').click();
        await expect(page.locator('.issue-row')).toHaveCount(2);
        await page.locator('[data-filter="all"]').click();
      }

      if (definition.name === 'validate-clean-complete') {
        await expect(page.locator('#summaryAll')).toHaveText('1');
        await expect(page.locator('#cleanStaleIndexes')).toBeDisabled();
        await expect(page.locator('#status')).toHaveText('Cleaned stale indexes on 2 Flow Endpoint(s); removed 2 stale connector reference(s).');
      }

      await expect(page.locator('.shell')).toHaveScreenshot(`${definition.name}.png`, {
        animations: 'disabled',
        scale: 'css',
      });
    });
  }
});
