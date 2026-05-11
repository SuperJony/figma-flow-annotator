import {
  buildPanelSelectionStateMessage,
  buildPanelStatusMessage,
  buildPanelValidationReportMessage,
  classifyPanelMessage,
  formatCleanStaleIndexesPanelStatus,
  formatDeepAuditRepairIndexPanelStatus,
  formatRefreshConnectorsPanelStatus,
  type PanelCommandMessage,
  type PanelMessageDispatch,
  type PanelStatusTone,
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
    const { report, targetsByIssueId } = await validateCurrentPageBindings(connectRuntime);
    validationTargetsByIssueId = targetsByIssueId;
    postValidationReport(report);
    postStatus("success", `Validation found ${report.summary.all} issue(s).`);
    return;
  }

  if (message.type === "clean-stale-indexes") {
    const result = await cleanStaleIndexes(connectRuntime);
    if (result.kind === "repair-required") {
      postStatus("error", result.message);
      return;
    }
    const { report, targetsByIssueId } = await validateCurrentPageBindings(connectRuntime);
    validationTargetsByIssueId = targetsByIssueId;
    postValidationReport(report);
    postStatus("success", formatCleanStaleIndexesPanelStatus(result));
    return;
  }

  if (message.type === "deep-audit-repair-index") {
    const result = deepAuditRepairValidationIndex(connectRuntime);
    const { report, targetsByIssueId } = await validateCurrentPageBindings(connectRuntime);
    validationTargetsByIssueId = targetsByIssueId;
    postValidationReport(report);
    postStatus("success", formatDeepAuditRepairIndexPanelStatus(result));
    return;
  }

  if (message.type === "locate-validation-issue") {
    await locateValidationIssue(message.issueId);
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

function postStatus(tone: PanelStatusTone, message: string): void {
  const statusMessage = buildPanelStatusMessage(tone, message);
  figma.ui.postMessage(statusMessage);
  if (statusMessage.tone === "success") {
    figma.notify(message);
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
