import { getFlowConnectorValidationIndexNodeIds } from "../connectors/operations.ts";
import type {
  CleanStaleIndexesOperationBatch,
  FigmaFileOperationBatch,
  SetSharedPluginDataOperation,
} from "../figma-file/operation-types.ts";
import {
  ANNOTATIONS_CONTAINER_NAME,
  CONNECTORS_CONTAINER_NAME,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "../shared/plugin-data.ts";
import type {
  AnnotationValidationBadgeInput,
  AnnotationValidationCardInput,
  FlowConnectorValidationConnectorInput,
  FlowConnectorValidationEndpointInput,
} from "./types.ts";
import { createValidationIndexRecord, type ValidationIndexRecord } from "./validation-index.ts";

export interface BuildAnnotationValidationIndexInput {
  badges: Pick<AnnotationValidationBadgeInput, "nodeId" | "record">[];
  cards: Pick<AnnotationValidationCardInput, "nodeId" | "record">[];
}

export interface BuildFlowConnectorValidationIndexInput {
  connectors: FlowConnectorValidationConnectorInput[];
  endpoints: FlowConnectorValidationEndpointInput[];
  liveValidationNodeIds: string[];
}

export interface BuildRepairValidationStateOperationBatchInput {
  annotations: BuildAnnotationValidationIndexInput;
  cleanBatch: CleanStaleIndexesOperationBatch;
  flowConnectors: BuildFlowConnectorValidationIndexInput;
}

export interface RepairValidationStateOperationBatch extends FigmaFileOperationBatch {
  kind: "repair-validation-state";
  repairedContainerRefs: string[];
}

export function buildRepairValidationStateOperationBatch(
  input: BuildRepairValidationStateOperationBatchInput,
): RepairValidationStateOperationBatch {
  const repairedContainerRefs = ["annotations-container", "connectors-container"];
  return {
    schemaVersion: 1,
    kind: "repair-validation-state",
    repairedContainerRefs,
    operations: [
      {
        type: "ensure-container",
        ref: "annotations-container",
        name: ANNOTATIONS_CONTAINER_NAME,
      },
      setContainerKindOperation("annotations-container"),
      setValidationIndexOperation(
        "annotations-container",
        buildAnnotationValidationIndex(input.annotations),
      ),
      {
        type: "ensure-container",
        ref: "connectors-container",
        name: CONNECTORS_CONTAINER_NAME,
      },
      setContainerKindOperation("connectors-container"),
      setValidationIndexOperation(
        "connectors-container",
        buildFlowConnectorValidationIndex(input.flowConnectors),
      ),
      ...input.cleanBatch.operations,
    ],
  };
}

export function buildAnnotationValidationIndex(
  input: BuildAnnotationValidationIndexInput,
): ValidationIndexRecord {
  return createValidationIndexRecord({
    annotationBadgeNodeIds: input.badges.map((badge) => badge.nodeId),
    annotationCardNodeIds: input.cards.map((card) => card.nodeId),
    connectorObstacleCandidateNodeIds: input.cards.map((card) => card.nodeId),
    contextFrameIds: [
      ...input.cards.map((card) => card.record.contextFrameId),
      ...input.badges.map((badge) => badge.record.contextFrameId),
    ],
    subjectNodeIds: [
      ...input.cards.flatMap((card) => card.record.subjectNodeIds),
      ...input.badges.map((badge) => badge.record.subjectNodeId),
    ],
  });
}

export function buildFlowConnectorValidationIndex(
  input: BuildFlowConnectorValidationIndexInput,
): ValidationIndexRecord {
  const liveConnectorIds = new Set(input.connectors.map((connector) => connector.record.id));
  const liveValidationNodeIds = new Set(input.liveValidationNodeIds);
  const connectorIndexNodeIds = input.connectors.map((connector) =>
    getFlowConnectorValidationIndexNodeIds(connector.record),
  );
  const liveNodeIds = (nodeIds: string[]) =>
    nodeIds.filter((nodeId) => liveValidationNodeIds.has(nodeId));
  const endpointsWithLiveConnectorRefs = input.endpoints.flatMap((endpoint) =>
    endpoint.connectorIds.some((connectorId) => liveConnectorIds.has(connectorId))
      ? [endpoint.nodeId]
      : [],
  );

  return createValidationIndexRecord({
    connectorObstacleCandidateNodeIds: liveNodeIds(
      connectorIndexNodeIds.flatMap((nodeIds) => nodeIds.connectorObstacleCandidateNodeIds),
    ),
    connectorRootNodeIds: input.connectors.map((connector) => connector.nodeId),
    contextFrameIds: liveNodeIds(
      connectorIndexNodeIds.flatMap((nodeIds) => nodeIds.contextFrameIds),
    ),
    flowEndpointNodeIds: [
      ...liveNodeIds(connectorIndexNodeIds.flatMap((nodeIds) => nodeIds.flowEndpointNodeIds)),
      ...endpointsWithLiveConnectorRefs,
    ],
    ownerContextFrameIds: liveNodeIds(
      connectorIndexNodeIds.flatMap((nodeIds) => nodeIds.ownerContextFrameIds),
    ),
  });
}

function setContainerKindOperation(containerRef: string): SetSharedPluginDataOperation {
  return {
    type: "set-shared-plugin-data",
    target: { kind: "container", ref: containerRef },
    key: SHARED_PLUGIN_DATA.keys.kind,
    value: VISUAL_NODE_KINDS.container,
  };
}

function setValidationIndexOperation(
  containerRef: string,
  record: ValidationIndexRecord,
): SetSharedPluginDataOperation {
  return {
    type: "set-shared-plugin-data",
    target: { kind: "container", ref: containerRef },
    key: SHARED_PLUGIN_DATA.keys.validationIndex,
    value: record,
  };
}
