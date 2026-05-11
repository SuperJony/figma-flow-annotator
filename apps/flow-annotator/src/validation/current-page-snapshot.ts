import {
  ANNOTATIONS_CONTAINER_NAME,
  SHARED_PLUGIN_DATA,
  type ValidationComputationSnapshot,
} from "@figma-flow-annotator/core";
import {
  getAnnotationValidationBadges,
  getAnnotationValidationCards,
} from "../annotations/records";
import {
  collectBoundedFlowConnectorValidationSnapshot,
  type FlowConnectorCurrentPageRuntime,
  toFlowConnectorReferenceValidationInput,
} from "../connectors/current-page-snapshot";
import { collectValidationFlowConnectorRouteFacts } from "../connectors/route-facts";
import { findContainer, readReferenceIds } from "../figma/runtime";

export async function collectCurrentPageValidationSnapshot(
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<ValidationComputationSnapshot> {
  const currentPage = figma.currentPage;
  const annotationsContainer = findContainer(ANNOTATIONS_CONTAINER_NAME);
  const cards =
    annotationsContainer === null ? [] : getAnnotationValidationCards(annotationsContainer);
  const badges =
    annotationsContainer === null ? [] : getAnnotationValidationBadges(annotationsContainer);
  const connectorSnapshot = await collectBoundedFlowConnectorValidationSnapshot(
    runtime,
    collectAnnotationReferenceNodeIds(cards, badges),
  );
  const flowConnectorRouteGeometry = await collectValidationFlowConnectorRouteFacts(
    runtime,
    connectorSnapshot.connectorRecords,
    collectAnnotationObstacleCandidateNodeIds(cards, badges),
  );
  const validationNodes = connectorSnapshot.validationNodes;
  const allNodes = [currentPage, ...validationNodes];
  const annotationNodeIds = new Set(collectAnnotationReferenceNodeIds(cards, badges));
  const subjects = validationNodes.flatMap((node) => {
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

  return {
    annotationBindings: {
      badges,
      cards,
      contexts,
      subjects,
    },
    flowConnectorReferences: toFlowConnectorReferenceValidationInput(connectorSnapshot),
    flowConnectorRouteGeometry,
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
