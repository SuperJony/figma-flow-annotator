import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

interface PanelSelectionState {
  connectorEndpoints?: { id: string; name: string }[];
  eligibleCount: number;
  existingConnector?: { flowAction: string | null; id: string; nodeId: string } | null;
  routingStatus?: string;
  selectedAnnotationCardCount?: number;
  totalCount: number;
}

interface PanelStatusState {
  message: string;
  tone: 'error' | 'success';
}

interface PanelFixtureDefinition {
  activeTab?: 'annotate' | 'connect' | 'validate';
  annotationBody?: string;
  description: string;
  flowAction?: string;
  name: string;
  selection?: PanelSelectionState;
  status?: PanelStatusState;
  validationReport?: {
    issues: {
      affectedObjectCount: number;
      code?: string;
      description: string;
      id: string;
      severity: 'error' | 'info' | 'warning';
      title: string;
    }[];
    schemaVersion: 1;
    summary: {
      all: number;
      errors: number;
      info: number;
      warnings: number;
    };
  };
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
    activeTab: 'connect',
    description: 'Two pending Flow Endpoint selections can create a connector.',
    flowAction: 'Choose plan',
    name: 'two-pending-connector-endpoints',
    selection: {
      connectorEndpoints: [
        { id: 'start-node', name: 'Start Frame' },
        { id: 'end-node', name: 'End Frame' },
      ],
      eligibleCount: 0,
      routingStatus: 'Route preview pending router validation.',
      totalCount: 2,
    },
  },
  {
    activeTab: 'connect',
    description: 'Existing directed connector status remains in create/upsert mode.',
    flowAction: 'Choose plan',
    name: 'existing-connector-status',
    selection: {
      connectorEndpoints: [
        { id: 'start-node', name: 'Start Frame' },
        { id: 'end-node', name: 'End Frame' },
      ],
      eligibleCount: 0,
      existingConnector: {
        flowAction: 'Choose plan',
        id: 'connector-1',
        nodeId: 'connector-node-1',
      },
      routingStatus: 'Route preview pending router validation.',
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
  {
    activeTab: 'validate',
    description: 'Validate tab report with severity filters, rows, and location actions.',
    name: 'validate-report',
    validationReport: {
      schemaVersion: 1,
      summary: {
        all: 3,
        errors: 1,
        warnings: 1,
        info: 1,
      },
      issues: [
        {
          affectedObjectCount: 1,
          description: 'An Annotation Card has an empty required Annotation Body.',
          id: 'annotation-missing-body-1',
          severity: 'error',
          title: 'Missing Required Annotation Body',
        },
        {
          affectedObjectCount: 2,
          description: 'Some bound Subject Nodes do not have a matching Annotation Badge.',
          id: 'annotation-missing-badge-2',
          severity: 'warning',
          title: 'Missing Annotation Badge',
        },
        {
          affectedObjectCount: 2,
          description: 'Annotation Badges beside a Subject Node are not arranged by Annotation Number.',
          id: 'annotation-badges-unarranged-3',
          severity: 'info',
          title: 'Unarranged Annotation Badges',
        },
      ],
    },
  },
  {
    activeTab: 'validate',
    description: 'Validate tab report with Flow Connector reference issues and stale cleanup enabled.',
    name: 'validate-connector-report',
    validationReport: {
      schemaVersion: 1,
      summary: {
        all: 5,
        errors: 3,
        warnings: 2,
        info: 0,
      },
      issues: [
        {
          affectedObjectCount: 1,
          code: 'flow-connector-orphaned',
          description: 'A Flow Connector is missing its start or end Flow Endpoint.',
          id: 'flow-connector-orphaned-1',
          severity: 'error',
          title: 'Orphaned Flow Connector',
        },
        {
          affectedObjectCount: 1,
          code: 'flow-endpoint-invalid',
          description: 'A Flow Connector points to a node that is not a valid Flow Endpoint.',
          id: 'flow-endpoint-invalid-2',
          severity: 'error',
          title: 'Invalid Flow Endpoint',
        },
        {
          affectedObjectCount: 2,
          code: 'flow-connector-duplicate',
          description: 'Multiple Flow Connectors use the same ordered start and end Flow Endpoints.',
          id: 'flow-connector-duplicate-3',
          severity: 'error',
          title: 'Duplicate Flow Connector',
        },
        {
          affectedObjectCount: 1,
          code: 'flow-action-empty',
          description: 'A Flow Connector has no Flow Action label.',
          id: 'flow-action-empty-4',
          severity: 'warning',
          title: 'Empty Flow Action',
        },
        {
          affectedObjectCount: 2,
          code: 'connector-reverse-index-stale',
          description: 'A Flow Endpoint has connectorRefs pointing to deleted Flow Connectors.',
          id: 'connector-reverse-index-stale-5',
          severity: 'warning',
          title: 'Stale Reverse Index',
        },
      ],
    },
  },
  {
    activeTab: 'validate',
    description: 'Validate tab after Clean Stale Indexes removes stale connectorRefs.',
    name: 'validate-clean-complete',
    status: {
      message: 'Cleaned stale indexes on 2 Flow Endpoint(s); removed 2 stale connector reference(s).',
      tone: 'success',
    },
    validationReport: {
      schemaVersion: 1,
      summary: {
        all: 1,
        errors: 0,
        warnings: 1,
        info: 0,
      },
      issues: [
        {
          affectedObjectCount: 1,
          code: 'flow-action-empty',
          description: 'A Flow Connector has no Flow Action label.',
          id: 'flow-action-empty-1',
          severity: 'warning',
          title: 'Empty Flow Action',
        },
      ],
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

  if (definition.activeTab !== undefined) {
    await page.locator(`[data-tab="${definition.activeTab}"]`).click();
  }

  if (definition.flowAction !== undefined) {
    await page.locator('#flowAction').fill(definition.flowAction);
  }

  if (definition.validationReport !== undefined) {
    await postPluginMessage(page, {
      type: 'validation-report',
      report: definition.validationReport,
    });
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
  pluginMessage: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((message) => {
    window.postMessage({ pluginMessage: message }, '*');
  }, pluginMessage);
}
