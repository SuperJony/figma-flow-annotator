import {
  buildCleanStaleIndexesOperationBatch,
  type CleanStaleIndexesOperationBatch,
  mergeValidationReports,
  SHARED_PLUGIN_DATA,
  type ValidationReport,
  validateAnnotationBindings,
  validateFlowConnectorReferences,
  validateFlowConnectorRouteGeometry,
} from "@figma-flow-annotator/core";
import {
  getAnnotationValidationBadges,
  getAnnotationValidationCards,
} from "../annotations/records";
import {
  collectFullPageFlowConnectorCurrentPageSnapshot,
  type FlowConnectorCurrentPageRuntime,
  toCleanStaleIndexesInput,
  toFlowConnectorReferenceValidationInput,
  toFlowConnectorRouteValidationInput,
} from "../connectors/current-page-snapshot";
import { applyFigmaFileOperationBatch } from "../figma/file-operations";
import { findContainer, readReferenceIds } from "../figma/runtime";

export interface CleanStaleIndexesResult {
  cleanedEndpointCount: number;
  removedConnectorRefCount: number;
}

export function validateCurrentPageBindings(runtime: FlowConnectorCurrentPageRuntime): {
  report: ValidationReport;
  targetsByIssueId: Map<string, string[]>;
} {
  const connectorSnapshot = collectFullPageFlowConnectorCurrentPageSnapshot(runtime);
  const pageNodes = connectorSnapshot.pageNodes;
  const allNodes = [figma.currentPage, ...pageNodes];
  const annotationsContainer = findContainer("FFA Annotations");
  const cards =
    annotationsContainer === null ? [] : getAnnotationValidationCards(annotationsContainer);
  const badges =
    annotationsContainer === null ? [] : getAnnotationValidationBadges(annotationsContainer);
  const subjects = pageNodes.map((node) => ({
    annotationIds: readReferenceIds(node, SHARED_PLUGIN_DATA.keys.annotationRefs, "annotationIds"),
    nodeId: node.id,
    ...(node.absoluteBoundingBox === null ? {} : { rect: node.absoluteBoundingBox }),
  }));
  const contexts = allNodes.map((node) => ({
    nodeId: node.id,
    ...("absoluteBoundingBox" in node && node.absoluteBoundingBox !== null
      ? { rect: node.absoluteBoundingBox }
      : {}),
  }));
  const annotationReport = validateAnnotationBindings({
    badges,
    cards,
    contexts,
    subjects,
  });
  const connectorReferenceInput = toFlowConnectorReferenceValidationInput(connectorSnapshot);
  const connectorReport = validateFlowConnectorReferences(connectorReferenceInput);
  const routeReport = validateFlowConnectorRouteGeometry(
    toFlowConnectorRouteValidationInput(connectorSnapshot, runtime),
  );
  const report = mergeValidationReports([annotationReport, connectorReport, routeReport]);

  return {
    report,
    targetsByIssueId: new Map(report.issues.map((issue) => [issue.id, issue.locationNodeIds])),
  };
}

export function cleanStaleIndexes(
  runtime: FlowConnectorCurrentPageRuntime,
): CleanStaleIndexesResult {
  const connectorSnapshot = collectFullPageFlowConnectorCurrentPageSnapshot(runtime);
  const batch = buildCleanStaleIndexesOperationBatch(toCleanStaleIndexesInput(connectorSnapshot));

  applyCleanStaleIndexesOperationBatch(
    batch,
    runtime,
    new Map(connectorSnapshot.pageNodes.map((node): [string, BaseNode] => [node.id, node])),
  );
  return {
    cleanedEndpointCount: batch.cleanedEndpointNodeIds.length,
    removedConnectorRefCount: batch.removedConnectorIds.length,
  };
}

function applyCleanStaleIndexesOperationBatch(
  batch: CleanStaleIndexesOperationBatch,
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
  existingNodes: Map<string, BaseNode>,
): void {
  applyFigmaFileOperationBatch({
    batch,
    existingNodes,
    namespace: runtime.namespace,
  });
}
