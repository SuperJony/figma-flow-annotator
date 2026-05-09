import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

interface PanelSelectionState {
  eligibleCount: number;
  selectedAnnotationCardCount?: number;
  totalCount: number;
}

interface PanelStatusState {
  message: string;
  tone: 'error' | 'success';
}

interface PanelFixtureDefinition {
  annotationBody?: string;
  description: string;
  flowAction?: string;
  name: string;
  selection?: PanelSelectionState;
  status?: PanelStatusState;
}

const PANEL_VIEWPORT = {
  height: 560,
  width: 360,
};

const panelHtml = readFileSync('ui.html', 'utf8');

export const panelFixtureDefinitions: PanelFixtureDefinition[] = [
  {
    description: 'Initial state before a selectable subject or pending endpoint exists.',
    name: 'initial-empty-selection',
  },
  {
    annotationBody: 'Review whether this interaction should stay modal after submit.',
    description: 'One eligible subject and a non-empty Annotation Body.',
    name: 'eligible-annotation-selection',
    selection: {
      eligibleCount: 1,
      totalCount: 0,
    },
  },
  {
    description: 'One selected Annotation Card and one Subject Node can add subjects.',
    name: 'add-subject-selection',
    selection: {
      eligibleCount: 1,
      selectedAnnotationCardCount: 1,
      totalCount: 0,
    },
  },
  {
    description: 'Two pending Flow Endpoint selections can create a connector.',
    flowAction: 'Choose plan',
    name: 'two-pending-connector-endpoints',
    selection: {
      eligibleCount: 0,
      totalCount: 2,
    },
  },
  {
    description: 'Success status uses the current panel status rendering.',
    name: 'success-status',
    selection: {
      eligibleCount: 1,
      totalCount: 0,
    },
    status: {
      message: 'Annotation created.',
      tone: 'success',
    },
  },
  {
    description: 'Error status uses the current panel status rendering.',
    name: 'error-status',
    selection: {
      eligibleCount: 0,
      totalCount: 0,
    },
    status: {
      message: 'Select exactly two Flow Endpoints before creating a connector.',
      tone: 'error',
    },
  },
];

export async function loadPanelFixture(
  page: Page,
  definition: PanelFixtureDefinition,
): Promise<void> {
  await page.setViewportSize(PANEL_VIEWPORT);
  await page.setContent(panelHtml);

  if (definition.selection !== undefined) {
    await postPluginMessage(page, {
      type: 'selection-state',
      ...definition.selection,
    });
  }

  if (definition.annotationBody !== undefined) {
    await page.locator('#annotationBody').fill(definition.annotationBody);
  }

  if (definition.flowAction !== undefined) {
    await page.locator('#flowAction').fill(definition.flowAction);
  }

  if (definition.status !== undefined) {
    await postPluginMessage(page, {
      type: 'status',
      ...definition.status,
    });
  }

  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  });
}

async function postPluginMessage(
  page: Page,
  pluginMessage: Record<string, number | string>,
): Promise<void> {
  await page.evaluate((message) => {
    window.postMessage({ pluginMessage: message }, '*');
  }, pluginMessage);
}
