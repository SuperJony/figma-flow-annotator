import { readFileSync } from "node:fs";

import {
  buildPanelSelectionStateMessage,
  buildPanelStatusMessage,
  buildPanelValidationOperationMessage,
  buildPanelValidationReportMessage,
  PANEL_EMPTY_ROUTING_STATUS,
  type PanelConnectorSelectionState,
  type PanelOutboundMessage,
  type PanelSelectionNodeInput,
  type PanelStatusMessage,
  type PanelValidationOperation,
  type PanelValidationOperationState,
  type ValidationReport,
} from "@figma-flow-annotator/core";
import type { Page } from "@playwright/test";

interface PanelSelectionState {
  connectorEndpoints?: PanelConnectorSelectionState["endpoints"];
  eligibleCount: number;
  existingConnector?: PanelConnectorSelectionState["existingConnector"];
  routingStatus?: string;
  selectedAnnotationCardCount?: number;
  totalCount: number;
}

type PanelStatusState = Omit<PanelStatusMessage, "type">;

interface PanelValidationOperationFixture {
  message?: string;
  operation: PanelValidationOperation;
  state: PanelValidationOperationState;
}

interface PanelFixtureDefinition {
  activeTab?: "annotate" | "connect" | "validate";
  annotationBody?: string;
  flowAction?: string;
  name: string;
  selection?: PanelSelectionState;
  status?: PanelStatusState;
  validationOperation?: PanelValidationOperationFixture;
  validationReport?: ValidationReport;
}

const PANEL_VIEWPORT = {
  height: 560,
  width: 360,
};

const panelHtml = readFileSync("ui.html", "utf8");

export const panelFixtureDefinitions: PanelFixtureDefinition[] = [
  {
    name: "initial-empty-selection",
  },
  {
    annotationBody: "Review whether this interaction should stay modal after submit.",
    name: "eligible-annotation-selection",
    selection: {
      eligibleCount: 1,
      totalCount: 0,
    },
  },
  {
    name: "add-subject-selection",
    selection: {
      eligibleCount: 1,
      selectedAnnotationCardCount: 1,
      totalCount: 0,
    },
  },
  {
    activeTab: "connect",
    flowAction: "Choose plan",
    name: "two-pending-connector-endpoints",
    selection: {
      connectorEndpoints: [
        { id: "start-node", name: "Start Frame" },
        { id: "end-node", name: "End Frame" },
      ],
      eligibleCount: 0,
      routingStatus: "Route preview pending router validation.",
      totalCount: 2,
    },
  },
  {
    activeTab: "connect",
    flowAction: "Choose plan",
    name: "existing-connector-status",
    selection: {
      connectorEndpoints: [
        { id: "start-node", name: "Start Frame" },
        { id: "end-node", name: "End Frame" },
      ],
      eligibleCount: 0,
      existingConnector: {
        flowAction: "Choose plan",
        id: "connector-1",
        nodeId: "connector-node-1",
      },
      routingStatus: "Route preview pending router validation.",
      totalCount: 2,
    },
  },
  {
    name: "success-status",
    selection: {
      eligibleCount: 1,
      totalCount: 0,
    },
    status: {
      message: "Annotation created.",
      tone: "success",
    },
  },
  {
    name: "error-status",
    selection: {
      eligibleCount: 0,
      totalCount: 0,
    },
    status: {
      message: "Select exactly two Flow Endpoints before creating a connector.",
      tone: "error",
    },
  },
  {
    activeTab: "validate",
    name: "validate-repair-required",
    status: {
      message:
        "Validation Index is missing. Run Deep Audit Repair to rebuild the Validation Index before ordinary cleanup.",
      tone: "error",
    },
  },
  {
    activeTab: "validate",
    name: "validate-empty-report",
    status: {
      message: "Validation found 0 issue(s).",
      tone: "success",
    },
    validationReport: {
      schemaVersion: 1,
      summary: {
        all: 0,
        errors: 0,
        warnings: 0,
        info: 0,
      },
      issues: [],
    },
  },
  {
    activeTab: "validate",
    name: "validate-report",
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
          code: "annotation-missing-body",
          description: "An Annotation Card has an empty required Annotation Body.",
          id: "annotation-missing-body-1",
          locationNodeIds: ["annotation-card-1"],
          severity: "error",
          title: "Missing Required Annotation Body",
        },
        {
          affectedObjectCount: 2,
          code: "annotation-missing-badge",
          description: "Some bound Subject Nodes do not have a matching Annotation Badge.",
          id: "annotation-missing-badge-2",
          locationNodeIds: ["subject-node-1", "subject-node-2"],
          severity: "warning",
          title: "Missing Annotation Badge",
        },
        {
          affectedObjectCount: 2,
          code: "annotation-badges-unarranged",
          description:
            "Annotation Badges beside a Subject Node are not arranged by Annotation Number.",
          id: "annotation-badges-unarranged-3",
          locationNodeIds: ["subject-node-3", "subject-node-4"],
          severity: "info",
          title: "Unarranged Annotation Badges",
        },
      ],
    },
  },
  {
    activeTab: "validate",
    name: "validate-connector-report",
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
          code: "flow-connector-orphaned",
          description: "A Flow Connector is missing its start or end Flow Endpoint.",
          id: "flow-connector-orphaned-1",
          locationNodeIds: ["connector-node-1"],
          severity: "error",
          title: "Orphaned Flow Connector",
        },
        {
          affectedObjectCount: 1,
          code: "flow-endpoint-invalid",
          description: "A Flow Connector points to a node that is not a valid Flow Endpoint.",
          id: "flow-endpoint-invalid-2",
          locationNodeIds: ["connector-node-2"],
          severity: "error",
          title: "Invalid Flow Endpoint",
        },
        {
          affectedObjectCount: 2,
          code: "flow-connector-duplicate",
          description:
            "Multiple Flow Connectors use the same ordered start and end Flow Endpoints.",
          id: "flow-connector-duplicate-3",
          locationNodeIds: ["connector-node-3", "connector-node-4"],
          severity: "error",
          title: "Duplicate Flow Connector",
        },
        {
          affectedObjectCount: 1,
          code: "flow-action-empty",
          description: "A Flow Connector has no Flow Action label.",
          id: "flow-action-empty-4",
          locationNodeIds: ["connector-node-5"],
          severity: "warning",
          title: "Empty Flow Action",
        },
        {
          affectedObjectCount: 2,
          code: "connector-reverse-index-stale",
          description: "A Flow Endpoint has connectorRefs pointing to deleted Flow Connectors.",
          id: "connector-reverse-index-stale-5",
          locationNodeIds: ["endpoint-node-1", "endpoint-node-2"],
          severity: "warning",
          title: "Stale Reverse Index",
        },
      ],
    },
  },
  {
    activeTab: "validate",
    name: "validate-route-label-trunk-report",
    validationReport: {
      schemaVersion: 1,
      summary: {
        all: 6,
        errors: 3,
        warnings: 2,
        info: 1,
      },
      issues: [
        {
          affectedObjectCount: 1,
          code: "connector-route-crosses-obstacle",
          description: "A Connector Route crosses a Connector Obstacle.",
          id: "connector-route-crosses-obstacle-1",
          locationNodeIds: ["connector-node-1"],
          severity: "error",
          title: "Connector Route Crosses Obstacle",
        },
        {
          affectedObjectCount: 2,
          code: "flow-action-label-overlap",
          description: "Visible Flow Action labels overlap each other.",
          id: "flow-action-label-overlap-3",
          locationNodeIds: ["connector-node-2", "connector-node-3"],
          severity: "warning",
          title: "Flow Action Label Overlap",
        },
        {
          affectedObjectCount: 2,
          code: "connector-trunk-missing",
          description:
            "Flow Connectors entering the same Flow Endpoint from the same direction do not share a Connector Trunk.",
          id: "connector-trunk-missing-5",
          locationNodeIds: ["connector-node-4", "connector-node-5"],
          severity: "warning",
          title: "Missing Connector Trunk",
        },
        {
          affectedObjectCount: 1,
          code: "connector-routing-failure",
          description:
            "A Flow Connector cannot produce a legal Orthogonal Route around current Connector Obstacles.",
          id: "connector-routing-failure-2",
          locationNodeIds: ["connector-node-6"],
          severity: "error",
          title: "Connector Routing Failure",
        },
        {
          affectedObjectCount: 1,
          code: "connector-route-refreshable",
          description:
            "A stored Connector Route differs from the route generated from current endpoints and Connector Obstacles.",
          id: "connector-route-refreshable-4",
          locationNodeIds: ["connector-node-7"],
          severity: "info",
          title: "Connector Route Can Be Refreshed",
        },
        {
          affectedObjectCount: 2,
          code: "connector-trunk-unexpected",
          description:
            "Flow Connectors with different Flow Endpoints or opposite directions share a Connector Trunk.",
          id: "connector-trunk-unexpected-6",
          locationNodeIds: ["connector-node-8", "connector-node-9"],
          severity: "error",
          title: "Unexpected Connector Trunk",
        },
      ],
    },
  },
  {
    activeTab: "validate",
    name: "validate-clean-complete",
    status: {
      message:
        "Cleaned stale indexes on 2 Flow Endpoint(s); removed 2 stale connector reference(s).",
      tone: "success",
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
          code: "flow-action-empty",
          description: "A Flow Connector has no Flow Action label.",
          id: "flow-action-empty-1",
          locationNodeIds: ["connector-node-1"],
          severity: "warning",
          title: "Empty Flow Action",
        },
      ],
    },
  },
  {
    activeTab: "validate",
    name: "validate-running",
    validationOperation: {
      message: "Validate Bindings is running.",
      operation: "validate-bindings",
      state: "running",
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
          affectedObjectCount: 2,
          code: "connector-reverse-index-stale",
          description: "A Flow Endpoint has connectorRefs pointing to deleted Flow Connectors.",
          id: "connector-reverse-index-stale-1",
          locationNodeIds: ["endpoint-node-1", "endpoint-node-2"],
          severity: "warning",
          title: "Stale Reverse Index",
        },
      ],
    },
  },
  {
    activeTab: "validate",
    name: "validate-failure",
    status: {
      message: "Validate Bindings failed: Unable to read Validation Index.",
      tone: "error",
    },
    validationOperation: {
      operation: "validate-bindings",
      state: "idle",
    },
    validationReport: {
      schemaVersion: 1,
      summary: {
        all: 1,
        errors: 1,
        warnings: 0,
        info: 0,
      },
      issues: [
        {
          affectedObjectCount: 1,
          code: "flow-connector-orphaned",
          description: "A Flow Connector is missing its start or end Flow Endpoint.",
          id: "flow-connector-orphaned-1",
          locationNodeIds: ["connector-node-1"],
          severity: "error",
          title: "Orphaned Flow Connector",
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
    await postPluginMessage(page, buildFixtureSelectionStateMessage(definition.selection));
  }

  if (definition.annotationBody !== undefined) {
    await page.locator("#annotationBody").fill(definition.annotationBody);
  }

  if (definition.activeTab !== undefined) {
    await page.locator(`[data-tab="${definition.activeTab}"]`).click();
  }

  if (definition.flowAction !== undefined) {
    await page.locator("#flowAction").fill(definition.flowAction);
  }

  if (definition.validationReport !== undefined) {
    await postPluginMessage(page, buildPanelValidationReportMessage(definition.validationReport));
  }

  if (definition.validationOperation !== undefined) {
    await postPluginMessage(
      page,
      buildPanelValidationOperationMessage(definition.validationOperation),
    );
  }

  if (definition.status !== undefined) {
    await postPluginMessage(
      page,
      buildPanelStatusMessage(definition.status.tone, definition.status.message),
    );
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

async function postPluginMessage(page: Page, pluginMessage: PanelOutboundMessage): Promise<void> {
  await page.evaluate((message) => {
    window.postMessage({ pluginMessage: message }, "*");
  }, pluginMessage);
}

function buildFixtureSelectionStateMessage(selection: PanelSelectionState) {
  const selectedNodes = createFixtureSelectionNodes(selection);
  return buildPanelSelectionStateMessage({
    connector: {
      endpoints: selection.connectorEndpoints ?? [],
      existingConnector: selection.existingConnector ?? null,
      routingStatus: selection.routingStatus ?? PANEL_EMPTY_ROUTING_STATUS,
    },
    selectedNodes,
  });
}

function createFixtureSelectionNodes(selection: PanelSelectionState): PanelSelectionNodeInput[] {
  const selectedAnnotationCardCount = selection.selectedAnnotationCardCount ?? 0;
  const eligibleNodes = Array.from({ length: selection.eligibleCount }, (_, index) => ({
    hasGeneratedAncestor: false,
    isAnnotationCard: index < selectedAnnotationCardCount,
  }));
  const generatedNodes = Array.from(
    { length: Math.max(0, selection.totalCount - selection.eligibleCount) },
    () => ({
      hasGeneratedAncestor: true,
      isAnnotationCard: false,
    }),
  );

  return [...eligibleNodes, ...generatedNodes];
}
