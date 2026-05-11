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
  collectBoundedFlowConnectorValidationSnapshot,
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

export async function validateCurrentPageBindings(
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<{
  report: ValidationReport;
  targetsByIssueId: Map<string, string[]>;
}> {
  const currentPage = figma.currentPage;
  const annotationsContainer = findContainer("FFA Annotations");
  const cards =
    annotationsContainer === null ? [] : getAnnotationValidationCards(annotationsContainer);
  const badges =
    annotationsContainer === null ? [] : getAnnotationValidationBadges(annotationsContainer);
  const connectorSnapshot = await collectBoundedFlowConnectorValidationSnapshot(
    runtime,
    collectAnnotationReferenceNodeIds(cards, badges),
    collectAnnotationObstacleCandidateNodeIds(cards, badges),
  );
  const pageNodes = connectorSnapshot.pageNodes;
  const allNodes = [currentPage, ...pageNodes];
  const annotationNodeIds = new Set(collectAnnotationReferenceNodeIds(cards, badges));
  const subjects = pageNodes.flatMap((node) => {
    const annotationIds = readReferenceIds(
      node,
      SHARED_PLUGIN_DATA.keys.annotationRefs,
      "annotationIds",
    );
    if (!annotationNodeIds.has(node.id) && annotationIds.length === 0) {
      return [];
    }
    return [
      {
        annotationIds,
        nodeId: node.id,
        ...(node.absoluteBoundingBox === null ? {} : { rect: node.absoluteBoundingBox }),
      },
    ];
  });
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

export async function cleanStaleIndexes(
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<CleanStaleIndexesResult> {
  const annotationsContainer = findContainer("FFA Annotations");
  const cards =
    annotationsContainer === null ? [] : getAnnotationValidationCards(annotationsContainer);
  const badges =
    annotationsContainer === null ? [] : getAnnotationValidationBadges(annotationsContainer);
  const connectorSnapshot = await collectBoundedFlowConnectorValidationSnapshot(
    runtime,
    collectAnnotationReferenceNodeIds(cards, badges),
    collectAnnotationObstacleCandidateNodeIds(cards, badges),
  );
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

function collectAnnotationReferenceNodeIds(
  cards: ReturnType<typeof getAnnotationValidationCards>,
  badges: ReturnType<typeof getAnnotationValidationBadges>,
): string[] {
  return [
    ...cards.flatMap((card) => [card.record.contextFrameId, ...card.record.subjectNodeIds]),
    ...badges.flatMap((badge) => [badge.record.contextFrameId, badge.record.subjectNodeId]),
  ];
}

function collectAnnotationObstacleCandidateNodeIds(
  cards: ReturnType<typeof getAnnotationValidationCards>,
  badges: ReturnType<typeof getAnnotationValidationBadges>,
): string[] {
  return [...cards.map((card) => card.nodeId), ...badges.map((badge) => badge.nodeId)];
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
