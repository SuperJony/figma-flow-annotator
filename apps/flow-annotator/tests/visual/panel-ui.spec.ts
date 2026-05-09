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

      if (definition.name === 'validate-route-label-trunk-report') {
        await expect(page.locator('#summaryAll')).toHaveText('6');
        await expect(page.locator('#summaryErrors')).toHaveText('3');
        await expect(page.locator('#summaryWarnings')).toHaveText('2');
        await expect(page.locator('#summaryInfo')).toHaveText('1');
        await expect(page.locator('#cleanStaleIndexes')).toBeDisabled();
        await expect(page.locator('.issue-title')).toHaveText([
          'Connector Route Crosses Obstacle',
          'Flow Action Label Overlap',
          'Missing Connector Trunk',
          'Connector Routing Failure',
          'Connector Route Can Be Refreshed',
          'Unexpected Connector Trunk',
        ]);

        const postedMessages: unknown[] = [];
        await page.exposeFunction('capturePluginPostMessage', (message: unknown) => {
          postedMessages.push(message);
        });
        await page.evaluate(() => {
          const windowWithCapture = window as unknown as {
            capturePluginPostMessage: (message: unknown) => void;
          };
          const originalPostMessage = window.parent.postMessage.bind(window.parent);
          window.parent.postMessage = ((message: unknown, targetOrigin: string, transfer?: Transferable[]) => {
            windowWithCapture.capturePluginPostMessage(message);
            originalPostMessage(message, targetOrigin, transfer ?? []);
          }) as typeof window.parent.postMessage;
        });
        await page.locator('[data-issue-id="flow-action-label-overlap-3"]').click();
        expect(postedMessages).toContainEqual({
          pluginMessage: {
            type: 'locate-validation-issue',
            issueId: 'flow-action-label-overlap-3',
          },
        });

        await page.locator('[data-filter="warning"]').click();
        await expect(page.locator('.issue-row')).toHaveCount(2);
        await page.locator('[data-filter="info"]').click();
        await expect(page.locator('.issue-title')).toHaveText('Connector Route Can Be Refreshed');
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
