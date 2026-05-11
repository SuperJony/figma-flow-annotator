import {
  buildPanelSelectionStateMessage,
  buildPanelStatusMessage,
  buildPanelValidationOperationMessage,
  buildPanelValidationReportMessage,
  classifyPanelMessage,
  formatCleanStaleIndexesPanelStatus,
  formatDeepAuditRepairIndexPanelStatus,
  formatRefreshConnectorsPanelStatus,
  type PanelCommandMessage,
  type PanelMessageDispatch,
  type PanelStatusTone,
  type PanelValidationOperation,
  type ValidationReport,
} from "@figma-flow-annotator/core";
import {
  addSubjectNodesToAnnotation,
  arrangeAnnotationCards,
  arrangeBadgesForSelectedSubjects,
  createAnnotations,
} from "../annotations/commands";
import { isAnnotationCardNode } from "../annotations/records";
import {
  type ConnectRuntime,
  createFlowConnector,
  getConnectSelectionState,
  handleSelectionChange,
  refreshFlowConnectors,
  resetObservedEndpointSelection,
  swapPendingConnectorEndpoints,
} from "../connectors/commands";
import {
  createId,
  createText,
  ensureContainer,
  ensureFont,
  ensureLayerOrder,
  findContextFrameId,
  getExistingSceneNodes,
  getVisibleBounds,
  hasGeneratedAncestor,
  NAMESPACE,
  solidPaint,
} from "../figma/runtime";
import {
  cleanStaleIndexes,
  deepAuditRepairValidationIndex,
  validateCurrentPageBindings,
} from "../validation/commands";

let validationTargetsByIssueId = new Map<string, string[]>();
let activeValidationOperation: PanelValidationOperation | null = null;

const connectRuntime: ConnectRuntime = {
  namespace: NAMESPACE,
  createId,
  createText,
  ensureContainer,
  ensureLayerOrder,
  findContextFrameId,
  getVisibleBounds,
  hasGeneratedAncestor,
  postSelectionState,
  solidPaint,
};

figma.showUI(__html__, {
  title: "Flow Annotator",
  width: 360,
  height: 560,
  themeColors: true,
});

resetObservedEndpointSelection(connectRuntime);
postSelectionState();
figma.on("selectionchange", () => {
  handleSelectionChange(connectRuntime);
});

figma.ui.onmessage = (message: unknown) => {
  void handleMessage(message);
};

async function handleMessage(message: unknown): Promise<void> {
  let dispatch: PanelMessageDispatch;
  try {
    dispatch = classifyPanelMessage(message);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown plugin error.";
    figma.notify(errorMessage);
    postStatus("error", errorMessage);
    postSelectionState();
    return;
  }

  if (dispatch.kind === "close") {
    figma.closePlugin();
    return;
  }

  if (dispatch.kind === "request-selection-state") {
    postSelectionState();
    return;
  }

  try {
    await ensureFont();
    await dispatchMessage(dispatch.command);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown plugin error.";
    figma.notify(errorMessage);
    postStatus("error", errorMessage);
  } finally {
    postSelectionState();
  }
}

async function dispatchMessage(message: PanelCommandMessage): Promise<void> {
  if (message.type === "create-annotation") {
    const created = createAnnotations(message.body);
    selectAndZoom(created.nodes);
    postStatus(
      "success",
      `Created annotation #${created.annotationNumber} with ${created.badgeCount} badge(s).`,
    );
    return;
  }

  if (message.type === "add-subject-nodes") {
    const result = addSubjectNodesToAnnotation();
    selectAndZoom(result.nodes);
    postStatus(
      "success",
      `Added ${result.addedSubjectCount} subject node(s) to annotation #${result.annotationNumber} with ${result.badgeCount} new badge(s).`,
    );
    return;
  }

  if (message.type === "arrange-badges") {
    const result = arrangeBadgesForSelectedSubjects();
    selectAndZoom(result.nodes);
    postStatus("success", `Arranged ${result.movedCount} annotation badge(s).`);
    return;
  }

  if (message.type === "arrange-cards") {
    const result = await arrangeAnnotationCards();
    selectAndZoom(result.nodes);
    postStatus("success", `Arranged ${result.movedCount} annotation card(s).`);
    return;
  }

  if (message.type === "create-connector") {
    const created = createFlowConnector(message.flowAction, connectRuntime);
    selectAndZoom([created]);
    postStatus("success", "Created or updated one flow connector.");
    return;
  }

  if (message.type === "refresh-connectors") {
    const result = await refreshFlowConnectors(connectRuntime);
    if (result.nodes.length > 0) {
      selectAndZoom(result.nodes);
    }
    postStatus(
      result.failedCount === 0 ? "success" : "error",
      formatRefreshConnectorsPanelStatus(result),
    );
    return;
  }

  if (message.type === "swap-connector-endpoints") {
    swapPendingConnectorEndpoints(connectRuntime);
    postStatus("success", "Swapped pending Flow Connector endpoints.");
    return;
  }

  if (message.type === "validate-bindings") {
    await runValidationOperation(message.type, async () => {
      const { report, targetsByIssueId } = await validateCurrentPageBindings(connectRuntime);
      validationTargetsByIssueId = targetsByIssueId;
      postValidationReport(report);
      postStatus("success", `Validation found ${report.summary.all} issue(s).`);
    });
    return;
  }

  if (message.type === "clean-stale-indexes") {
    await runValidationOperation(message.type, async () => {
      const result = await cleanStaleIndexes(connectRuntime);
      if (result.kind === "repair-required") {
        postValidationOperationFailure(message.type, result.message);
        postStatus("error", result.message, false);
        return;
      }
      const { report, targetsByIssueId } = await validateCurrentPageBindings(connectRuntime);
      validationTargetsByIssueId = targetsByIssueId;
      postValidationReport(report);
      postStatus("success", formatCleanStaleIndexesPanelStatus(result));
    });
    return;
  }

  if (message.type === "deep-audit-repair-index") {
    await runValidationOperation(message.type, async () => {
      const result = await deepAuditRepairValidationIndex(connectRuntime);
      const { report, targetsByIssueId } = await validateCurrentPageBindings(connectRuntime);
      validationTargetsByIssueId = targetsByIssueId;
      postValidationReport(report);
      postStatus("success", formatDeepAuditRepairIndexPanelStatus(result));
    });
    return;
  }

  if (message.type === "locate-validation-issue") {
    await locateValidationIssue(message.issueId);
  }
}

async function runValidationOperation(
  operation: PanelValidationOperation,
  action: () => Promise<void>,
): Promise<void> {
  if (activeValidationOperation !== null) {
    postStatus(
      "error",
      `${formatValidationOperationLabel(activeValidationOperation)} is already running.`,
      true,
    );
    return;
  }

  activeValidationOperation = operation;
  const runningMessage = `${formatValidationOperationLabel(operation)} is running.`;
  figma.notify(`${formatValidationOperationLabel(operation)} started.`);
  postValidationOperation(operation, "running", runningMessage);

  try {
    await action();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown plugin error.";
    postValidationOperationFailure(operation, errorMessage);
    postStatus("error", formatValidationOperationFailure(operation, errorMessage), false);
  } finally {
    activeValidationOperation = null;
    postValidationOperation(operation, "idle");
  }
}

async function locateValidationIssue(issueId: string): Promise<void> {
  const nodeIds = validationTargetsByIssueId.get(issueId);
  if (nodeIds === undefined) {
    throw new Error("Validation issue is no longer available. Run Validate again.");
  }

  const nodes = await getExistingSceneNodes(nodeIds);
  if (nodes.length === 0) {
    throw new Error("No live Figma nodes are available for this validation issue.");
  }

  selectAndZoom(nodes);
  postStatus("success", `Located ${nodes.length} validation object(s).`);
}

function selectAndZoom(nodes: SceneNode[]): void {
  figma.currentPage.selection = nodes;
  resetObservedEndpointSelection(connectRuntime);
  figma.viewport.scrollAndZoomIntoView(nodes);
}

function postStatus(tone: PanelStatusTone, message: string, notify = tone === "success"): void {
  const statusMessage = buildPanelStatusMessage(tone, message);
  figma.ui.postMessage(statusMessage);
  if (notify) {
    figma.notify(message);
  }
}

function postValidationOperation(
  operation: PanelValidationOperation,
  state: "running" | "idle",
  message?: string,
): void {
  figma.ui.postMessage(buildPanelValidationOperationMessage({ message, operation, state }));
}

function postValidationOperationFailure(
  operation: PanelValidationOperation,
  errorMessage: string,
): void {
  figma.notify(formatValidationOperationFailure(operation, errorMessage));
}

function formatValidationOperationFailure(
  operation: PanelValidationOperation,
  errorMessage: string,
): string {
  return `${formatValidationOperationLabel(operation)} failed: ${errorMessage}`;
}

function formatValidationOperationLabel(operation: PanelValidationOperation): string {
  switch (operation) {
    case "validate-bindings":
      return "Validate Bindings";
    case "clean-stale-indexes":
      return "Clean Stale Indexes";
    case "deep-audit-repair-index":
      return "Deep Audit Repair";
  }
}

function postValidationReport(report: ValidationReport): void {
  figma.ui.postMessage(buildPanelValidationReportMessage(report));
}

function postSelectionState(): void {
  const selected = figma.currentPage.selection;
  const connectState = getConnectSelectionState(connectRuntime);
  figma.ui.postMessage(
    buildPanelSelectionStateMessage({
      connector: connectState,
      selectedNodes: selected.map((node) => ({
        hasGeneratedAncestor: hasGeneratedAncestor(node),
        isAnnotationCard: isAnnotationCardNode(node),
      })),
    }),
  );
}
