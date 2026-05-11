import {
  ANNOTATIONS_CONTAINER_NAME,
  buildCleanStaleIndexesOperationBatch,
  buildRepairValidationStateOperationBatch,
  type CleanStaleIndexesOperationBatch,
  CONNECTORS_CONTAINER_NAME,
  createEmptyValidationIndexRecord,
  decodeValidationIndexRecord,
  getValidationRepairStatus,
  mergeValidationIndexRecord,
  runValidationComputation,
  SHARED_PLUGIN_DATA,
  type ValidationIndexReadiness,
  type ValidationIndexRecord,
  type ValidationReport,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import {
  getAnnotationValidationBadges,
  getAnnotationValidationCards,
} from "../annotations/records";
import {
  collectDeepAuditFlowConnectorCurrentPageSnapshot,
  collectFlowConnectorCurrentPageSnapshot,
  type FlowConnectorCurrentPageRuntime,
  type FlowConnectorValidationSnapshot,
  toCleanStaleIndexesInput,
  toFlowConnectorReferenceValidationInput,
} from "../connectors/current-page-snapshot";
import { applyFigmaFileOperationBatch } from "../figma/file-operations";
import { ensureContainer, findContainer } from "../figma/runtime";
import { collectCurrentPageValidationSnapshot } from "./current-page-snapshot";

export type CleanStaleIndexesResult =
  | {
      kind: "cleaned";
      cleanedEndpointCount: number;
      removedConnectorRefCount: number;
    }
  | {
      kind: "repair-required";
      message: string;
      readiness: Exclude<ValidationIndexReadiness, { kind: "valid" }>;
    };

export interface RepairValidationStateResult {
  cleanedEndpointCount: number;
  removedConnectorRefCount: number;
  repairedContainerCount: number;
}

type IndexedFlowConnectorCleanupSnapshotResult =
  | {
      kind: "snapshot";
      snapshot: FlowConnectorValidationSnapshot;
    }
  | {
      kind: "repair-required";
      readiness: Exclude<ValidationIndexReadiness, { kind: "valid" }>;
    };

export async function validateCurrentPageBindings(
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<{
  report: ValidationReport;
  targetsByIssueId: Map<string, string[]>;
}> {
  const snapshot = await collectCurrentPageValidationSnapshot(runtime);
  const report = runValidationComputation(snapshot);

  return {
    report,
    targetsByIssueId: new Map(report.issues.map((issue) => [issue.id, issue.locationNodeIds])),
  };
}

async function collectIndexedFlowConnectorCleanupSnapshot(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): Promise<IndexedFlowConnectorCleanupSnapshotResult> {
  const currentPage = figma.currentPage;
  const getNodeByIdAsync = figma.getNodeByIdAsync.bind(figma);
  const indexReadiness = readMergedValidationIndex(runtime);
  if (indexReadiness.kind !== "valid") {
    return {
      kind: "repair-required",
      readiness: indexReadiness,
    };
  }

  const snapshot = collectFlowConnectorCurrentPageSnapshot(runtime);
  const insufficientReadiness = await getConnectorIndexInsufficiency(
    indexReadiness.index,
    snapshot.connectorRecords,
    getNodeByIdAsync,
  );
  if (insufficientReadiness !== null) {
    return {
      kind: "repair-required",
      readiness: insufficientReadiness,
    };
  }

  const missingNodeIds = await getMissingNodeIds(
    collectValidationIndexNodeIds(indexReadiness.index),
    getNodeByIdAsync,
  );
  if (missingNodeIds.length > 0) {
    return {
      kind: "repair-required",
      readiness: { kind: "stale", missingNodeIds },
    };
  }

  const validationNodes = await getExistingSceneNodesById(
    indexReadiness.index.flowEndpointNodeIds,
    currentPage.id,
    getNodeByIdAsync,
  );
  return {
    kind: "snapshot",
    snapshot: {
      ...snapshot,
      validationNodes,
    },
  };
}

export async function cleanStaleIndexes(
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<CleanStaleIndexesResult> {
  const indexedSnapshot = await collectIndexedFlowConnectorCleanupSnapshot(runtime);
  if (indexedSnapshot.kind === "repair-required") {
    return {
      kind: "repair-required",
      message: getValidationRepairStatus(indexedSnapshot.readiness),
      readiness: indexedSnapshot.readiness,
    };
  }

  const batch = buildCleanStaleIndexesOperationBatch(
    toCleanStaleIndexesInput(indexedSnapshot.snapshot),
  );

  applyCleanStaleIndexesOperationBatch(
    batch,
    runtime,
    new Map(
      indexedSnapshot.snapshot.validationNodes.map((node): [string, BaseNode] => [node.id, node]),
    ),
  );
  return {
    kind: "cleaned",
    cleanedEndpointCount: batch.cleanedEndpointNodeIds.length,
    removedConnectorRefCount: batch.removedConnectorIds.length,
  };
}

export async function repairValidationState(
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<RepairValidationStateResult> {
  const annotationsContainer = findContainer(ANNOTATIONS_CONTAINER_NAME);
  const cards =
    annotationsContainer === null ? [] : getAnnotationValidationCards(annotationsContainer);
  const badges =
    annotationsContainer === null ? [] : getAnnotationValidationBadges(annotationsContainer);
  const fullSnapshot = await collectDeepAuditFlowConnectorCurrentPageSnapshot(runtime);
  const cleanBatch = buildCleanStaleIndexesOperationBatch(toCleanStaleIndexesInput(fullSnapshot));
  const connectorReferenceInput = toFlowConnectorReferenceValidationInput(fullSnapshot);
  const repairBatch = buildRepairValidationStateOperationBatch({
    annotations: {
      badges,
      cards,
    },
    cleanBatch,
    flowConnectors: {
      connectors: fullSnapshot.connectorRecords.map((connector) => ({
        nodeId: connector.node.id,
        record: connector.record,
      })),
      endpoints: connectorReferenceInput.endpoints,
      liveValidationNodeIds: fullSnapshot.validationNodes.map((node) => node.id),
    },
  });
  const existingNodes = new Map(
    fullSnapshot.validationNodes.map((node): [string, BaseNode] => [node.id, node]),
  );

  applyFigmaFileOperationBatch({
    batch: repairBatch,
    existingNodes,
    namespace: runtime.namespace,
    writer: {
      ensureContainer: ensureValidationIndexContainer,
    },
  });

  return {
    cleanedEndpointCount: cleanBatch.cleanedEndpointNodeIds.length,
    removedConnectorRefCount: cleanBatch.removedConnectorIds.length,
    repairedContainerCount: repairBatch.repairedContainerRefs.length,
  };
}

function ensureValidationIndexContainer(name: string): FrameNode {
  const container = ensureContainer(name);
  if (container.parent === null) {
    figma.currentPage.appendChild(container);
  }
  return container;
}

function readMergedValidationIndex(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
):
  | ({ kind: "valid"; index: ValidationIndexRecord } & ValidationIndexReadiness)
  | Exclude<ValidationIndexReadiness, { kind: "valid" }> {
  const containers = findValidationIndexContainers(runtime);
  if (containers.length === 0) {
    return { kind: "missing" };
  }

  const invalidSourceNodeIds: string[] = [];
  const records: ValidationIndexRecord[] = [];
  containers.forEach((container) => {
    const raw = container.getSharedPluginData(
      runtime.namespace,
      SHARED_PLUGIN_DATA.keys.validationIndex,
    );
    if (raw.length === 0) {
      return;
    }
    const record = decodeValidationIndexRecord(raw);
    if (record === null) {
      invalidSourceNodeIds.push(container.id);
      return;
    }
    records.push(record);
  });

  if (invalidSourceNodeIds.length > 0) {
    return { kind: "invalid", sourceNodeIds: invalidSourceNodeIds };
  }
  if (records.length === 0) {
    return { kind: "missing" };
  }

  return {
    kind: "valid",
    index: records.reduce(
      (merged, record) => mergeValidationIndexRecord(merged, record),
      createEmptyValidationIndexRecord(),
    ),
  };
}

function findValidationIndexContainers(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): FrameNode[] {
  return figma.currentPage.children.flatMap((child) => {
    if (
      child.type !== "FRAME" ||
      (child.name !== ANNOTATIONS_CONTAINER_NAME && child.name !== CONNECTORS_CONTAINER_NAME) ||
      child.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) !==
        VISUAL_NODE_KINDS.container
    ) {
      return [];
    }
    return [child];
  });
}

async function getConnectorIndexInsufficiency(
  index: ValidationIndexRecord,
  connectorRecords: ReturnType<typeof collectFlowConnectorCurrentPageSnapshot>["connectorRecords"],
  getNodeByIdAsync: (nodeId: string) => Promise<BaseNode | null>,
): Promise<Extract<ValidationIndexReadiness, { kind: "insufficient" }> | null> {
  const liveEndpointNodeIds: string[] = [];
  for (const endpointNodeId of connectorRecords.flatMap((connector) => [
    connector.record.start.nodeId,
    connector.record.end.nodeId,
  ])) {
    const node = await getNodeByIdAsync(endpointNodeId);
    if (node !== null && !node.removed) {
      liveEndpointNodeIds.push(endpointNodeId);
    }
  }

  const missingFieldIds = {
    connectorRootNodeIds: connectorRecords
      .map((connector) => connector.node.id)
      .filter((nodeId) => !index.connectorRootNodeIds.includes(nodeId)),
    flowEndpointNodeIds: liveEndpointNodeIds.filter(
      (nodeId) => !index.flowEndpointNodeIds.includes(nodeId),
    ),
  };
  if (
    missingFieldIds.connectorRootNodeIds.length === 0 &&
    missingFieldIds.flowEndpointNodeIds.length === 0
  ) {
    return null;
  }

  return {
    kind: "insufficient",
    missingFieldIds,
  };
}

function collectValidationIndexNodeIds(index: ValidationIndexRecord): string[] {
  return [
    ...index.subjectNodeIds,
    ...index.annotationCardNodeIds,
    ...index.annotationBadgeNodeIds,
    ...index.flowEndpointNodeIds,
    ...index.contextFrameIds,
    ...index.ownerContextFrameIds,
    ...index.connectorRootNodeIds,
    ...index.connectorObstacleCandidateNodeIds,
  ];
}

async function getExistingSceneNodesById(
  nodeIds: Iterable<string>,
  currentPageId: string,
  getNodeByIdAsync: (nodeId: string) => Promise<BaseNode | null>,
): Promise<SceneNode[]> {
  const nodes: SceneNode[] = [];
  for (const nodeId of nodeIds) {
    if (nodeId === currentPageId) {
      continue;
    }
    const node = await getNodeByIdAsync(nodeId);
    if (node !== null && node.type !== "PAGE" && !node.removed && "absoluteBoundingBox" in node) {
      nodes.push(node as SceneNode);
    }
  }
  return nodes;
}

async function getMissingNodeIds(
  nodeIds: Iterable<string>,
  getNodeByIdAsync: (nodeId: string) => Promise<BaseNode | null>,
): Promise<string[]> {
  const missingNodeIds: string[] = [];
  for (const nodeId of new Set(nodeIds)) {
    const node = await getNodeByIdAsync(nodeId);
    if (node === null || node.removed) {
      missingNodeIds.push(nodeId);
    }
  }
  return missingNodeIds;
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
