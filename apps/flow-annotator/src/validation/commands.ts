import {
  buildCleanStaleIndexesOperationBatch,
  type CleanStaleIndexesOperationBatch,
  CONNECTORS_CONTAINER_NAME,
  decodeFlowConnectorRecord,
  type FlowConnectorRecord,
  type FlowConnectorRouteValidationConnectorInput,
  type FlowConnectorValidationConnectorInput,
  type FlowConnectorValidationEndpointInput,
  mergeValidationReports,
  SHARED_PLUGIN_DATA,
  type ValidateFlowConnectorReferencesInput,
  type ValidateFlowConnectorRouteGeometryInput,
  type ValidationReport,
  VISUAL_NODE_KINDS,
  validateAnnotationBindings,
  validateFlowConnectorReferences,
  validateFlowConnectorRouteGeometry,
} from "@figma-flow-annotator/core";
import {
  getAnnotationValidationBadges,
  getAnnotationValidationCards,
} from "../annotations/records";
import type { ConnectRuntime } from "../connectors/commands";
import { collectConnectorObstacles } from "../connectors/commands";
import { applyFigmaFileOperationBatch } from "../figma/file-operations";
import {
  collectCurrentPageNodes,
  findContainer,
  getVisibleBounds,
  hasGeneratedAncestor,
  NAMESPACE,
  readReferenceIds,
} from "../figma/runtime";

export interface CleanStaleIndexesResult {
  cleanedEndpointCount: number;
  removedConnectorRefCount: number;
}

export function validateCurrentPageBindings(runtime: ConnectRuntime): {
  report: ValidationReport;
  targetsByIssueId: Map<string, string[]>;
} {
  const pageNodes = collectCurrentPageNodes();
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
  const connectorRecords = getFlowConnectorValidationRecords();
  const connectorReferenceInput = getFlowConnectorReferenceValidationInput(
    pageNodes,
    connectorRecords,
  );
  const connectorReport = validateFlowConnectorReferences(connectorReferenceInput);
  const routeReport = validateFlowConnectorRouteGeometry(
    getFlowConnectorRouteValidationInput(pageNodes, connectorRecords, runtime),
  );
  const report = mergeValidationReports([annotationReport, connectorReport, routeReport]);

  return {
    report,
    targetsByIssueId: new Map(report.issues.map((issue) => [issue.id, issue.locationNodeIds])),
  };
}

export function cleanStaleIndexes(): CleanStaleIndexesResult {
  const pageNodes = collectCurrentPageNodes();
  const connectorInput = getFlowConnectorReferenceValidationInput(
    pageNodes,
    getFlowConnectorValidationRecords(),
  );
  const batch = buildCleanStaleIndexesOperationBatch({
    endpoints: connectorInput.endpoints,
    liveConnectorIds: connectorInput.connectors.map((connector) => connector.record.id),
  });

  applyCleanStaleIndexesOperationBatch(
    batch,
    new Map(pageNodes.map((node): [string, BaseNode] => [node.id, node])),
  );
  return {
    cleanedEndpointCount: batch.cleanedEndpointNodeIds.length,
    removedConnectorRefCount: batch.removedConnectorIds.length,
  };
}

function applyCleanStaleIndexesOperationBatch(
  batch: CleanStaleIndexesOperationBatch,
  existingNodes: Map<string, BaseNode>,
): void {
  applyFigmaFileOperationBatch({
    batch,
    existingNodes,
    namespace: NAMESPACE,
  });
}

function getFlowConnectorValidationRecords(): { node: GroupNode; record: FlowConnectorRecord }[] {
  const connectorsContainer = findContainer(CONNECTORS_CONTAINER_NAME);
  return connectorsContainer === null
    ? []
    : connectorsContainer.children.flatMap((child) => {
        if (
          child.type !== "GROUP" ||
          child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) !==
            VISUAL_NODE_KINDS.flowConnector
        ) {
          return [];
        }

        const record = readFlowConnectorValidationRecord(child);
        return record === null ? [] : [{ node: child, record }];
      });
}

function getFlowConnectorReferenceValidationInput(
  pageNodes: SceneNode[],
  connectorRecords: {
    node: GroupNode;
    record: FlowConnectorRecord;
  }[] = getFlowConnectorValidationRecords(),
): ValidateFlowConnectorReferencesInput {
  const connectors: FlowConnectorValidationConnectorInput[] = connectorRecords.map((connector) => ({
    nodeId: connector.node.id,
    record: connector.record,
  }));
  const endpoints: FlowConnectorValidationEndpointInput[] = pageNodes.map((node) => ({
    connectorIds: readReferenceIds(node, SHARED_PLUGIN_DATA.keys.connectorRefs, "connectorIds"),
    isEligibleFlowEndpoint: isFlowEndpointEligibleNode(node),
    nodeId: node.id,
  }));

  return { connectors, endpoints };
}

function getFlowConnectorRouteValidationInput(
  pageNodes: SceneNode[],
  connectorRecords: { node: GroupNode; record: FlowConnectorRecord }[],
  runtime: ConnectRuntime,
): ValidateFlowConnectorRouteGeometryInput {
  const nodesById = new Map(pageNodes.map((node): [string, SceneNode] => [node.id, node]));
  const connectors: FlowConnectorRouteValidationConnectorInput[] = connectorRecords.map(
    (connector) => {
      const startNode = nodesById.get(connector.record.start.nodeId);
      const endNode = nodesById.get(connector.record.end.nodeId);
      const labelRect = getFlowActionLabelRect(connector.node);
      const baseInput = {
        nodeId: connector.node.id,
        record: connector.record,
        ...(labelRect === undefined ? {} : { labelRect }),
      };

      if (
        startNode === undefined ||
        endNode === undefined ||
        startNode.absoluteBoundingBox === null ||
        endNode.absoluteBoundingBox === null
      ) {
        return {
          ...baseInput,
          obstacles: [],
        };
      }

      return {
        ...baseInput,
        endRect: getVisibleBounds(endNode),
        obstacles: collectConnectorObstacles(startNode, endNode, runtime),
        startRect: getVisibleBounds(startNode),
      };
    },
  );

  return { connectors };
}

function getFlowActionLabelRect(connectorRoot: GroupNode): Rect | undefined {
  const label = connectorRoot.children.find(
    (child) =>
      child.name === "FFA Flow Action Label" &&
      child.visible !== false &&
      "absoluteBoundingBox" in child &&
      child.absoluteBoundingBox !== null,
  );
  return label === undefined ||
    !("absoluteBoundingBox" in label) ||
    label.absoluteBoundingBox === null
    ? undefined
    : label.absoluteBoundingBox;
}

function readFlowConnectorValidationRecord(node: BaseNode): FlowConnectorRecord | null {
  return decodeFlowConnectorRecord(
    node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.connector),
  );
}

function isFlowEndpointEligibleNode(node: SceneNode): boolean {
  return (
    node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) === "" &&
    !hasGeneratedAncestor(node)
  );
}
