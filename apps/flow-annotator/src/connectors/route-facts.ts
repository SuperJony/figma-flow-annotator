import {
  ANNOTATIONS_CONTAINER_NAME,
  CONNECTORS_CONTAINER_NAME,
  type CreateFlowConnectorRouteFacts,
  createEmptyValidationIndexRecord,
  decodeValidationIndexRecord,
  getFlowConnectorValidationIndexNodeIds,
  mergeValidationIndexRecord,
  SHARED_PLUGIN_DATA,
  type ValidationIndexRecord,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import {
  collectFlowConnectorCurrentPageSnapshot,
  type FlowConnectorCurrentPageRuntime,
  type FlowConnectorSnapshotRecord,
  toFlowConnectorAuthoringEndpoint,
} from "./current-page-snapshot";
import { collectConnectorObstacles } from "./obstacles";

export interface CreateFlowConnectorRuntimeRouteFacts {
  existingConnectorNodesById: Map<string, GroupNode>;
  routeFacts: CreateFlowConnectorRouteFacts;
}

export async function collectCreateFlowConnectorRouteFacts(
  endpoints: SceneNode[],
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<CreateFlowConnectorRuntimeRouteFacts> {
  const snapshot = collectFlowConnectorCurrentPageSnapshot(runtime);
  const endpointFacts = endpoints.map((endpoint) =>
    toFlowConnectorAuthoringEndpoint(endpoint, runtime),
  );

  return {
    existingConnectorNodesById: new Map(
      snapshot.connectorRecords.map((connector) => [connector.node.id, connector.node]),
    ),
    routeFacts: {
      endpoints: endpointFacts,
      existingConnectors: snapshot.connectorRecords.map((connector) => ({
        nodeId: connector.node.id,
        record: connector.record,
      })),
      obstacles:
        endpoints.length === 2
          ? collectConnectorObstacles(
              endpoints[0],
              endpoints[1],
              runtime,
              await collectBoundedConnectorObstacleCandidates(
                runtime,
                endpointFacts.map((endpoint) => endpoint.contextFrameId),
                snapshot.connectorRecords,
              ),
            )
          : [],
    },
  };
}

async function collectBoundedConnectorObstacleCandidates(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
  endpointContextFrameIds: Iterable<string>,
  connectorRecords: FlowConnectorSnapshotRecord[],
): Promise<SceneNode[]> {
  const currentPage = figma.currentPage;
  const nodeIds = new Set<string>(endpointContextFrameIds);
  const validationIndex = readMergedProjectValidationIndex(runtime);

  addNodeIds(nodeIds, validationIndex.annotationCardNodeIds);
  addNodeIds(nodeIds, validationIndex.contextFrameIds);
  addNodeIds(nodeIds, validationIndex.ownerContextFrameIds);
  addNodeIds(nodeIds, validationIndex.connectorObstacleCandidateNodeIds);
  connectorRecords.forEach((connector) => {
    const indexNodeIds = getFlowConnectorValidationIndexNodeIds(connector.record);
    addNodeIds(nodeIds, indexNodeIds.connectorObstacleCandidateNodeIds);
  });

  return getExistingSceneNodesById(nodeIds, currentPage.id, figma.getNodeByIdAsync.bind(figma));
}

function readMergedProjectValidationIndex(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): ValidationIndexRecord {
  return findProjectValidationIndexContainers(runtime)
    .map((container) =>
      decodeValidationIndexRecord(
        container.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.validationIndex),
      ),
    )
    .filter((record): record is ValidationIndexRecord => record !== null)
    .reduce(
      (merged, record) => mergeValidationIndexRecord(merged, record),
      createEmptyValidationIndexRecord(),
    );
}

function findProjectValidationIndexContainers(
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

async function getExistingSceneNodesById(
  nodeIds: Iterable<string>,
  currentPageId: string,
  getNodeByIdAsync: (nodeId: string) => Promise<BaseNode | null>,
): Promise<SceneNode[]> {
  const nodes = await Promise.all(
    [...new Set(nodeIds)]
      .filter((nodeId) => nodeId !== currentPageId)
      .map((nodeId) => getNodeByIdAsync(nodeId)),
  );
  return nodes.filter(isLiveSceneNode);
}

function addNodeIds(target: Set<string>, nodeIds: Iterable<string>): void {
  for (const nodeId of nodeIds) {
    target.add(nodeId);
  }
}

function isLiveSceneNode(node: BaseNode | null): node is SceneNode {
  return node !== null && node.type !== "PAGE" && !node.removed && "absoluteBoundingBox" in node;
}
