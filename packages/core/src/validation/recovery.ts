import { getFlowConnectorValidationIndexNodeIds } from "../connectors/operations.ts";
import type {
  CleanStaleIndexesOperationBatch,
  FigmaFileOperationBatch,
  SetSharedPluginDataOperation,
} from "../figma-file/operation-types.ts";
import { SHARED_PLUGIN_DATA } from "../shared/plugin-data.ts";
import type {
  AnnotationValidationBadgeInput,
  AnnotationValidationCardInput,
  FlowConnectorValidationConnectorInput,
  FlowConnectorValidationEndpointInput,
} from "./types.ts";
import {
  createValidationIndexRecord,
  mergeValidationIndexRecord,
  type ValidationIndexRecord,
} from "./validation-index.ts";

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
  repairedIndexTargetCount: number;
}

export function buildRepairValidationStateOperationBatch(
  input: BuildRepairValidationStateOperationBatchInput,
): RepairValidationStateOperationBatch {
  const index = mergeValidationIndexRecord(
    buildAnnotationValidationIndex(input.annotations),
    buildFlowConnectorValidationIndex(input.flowConnectors),
  );
  return {
    schemaVersion: 1,
    kind: "repair-validation-state",
    repairedIndexTargetCount: 1,
    operations: [setValidationIndexOperation(index), ...input.cleanBatch.operations],
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

function setValidationIndexOperation(record: ValidationIndexRecord): SetSharedPluginDataOperation {
  return {
    type: "set-shared-plugin-data",
    target: { kind: "current-page" },
    key: SHARED_PLUGIN_DATA.keys.validationIndex,
    value: record,
  };
}
