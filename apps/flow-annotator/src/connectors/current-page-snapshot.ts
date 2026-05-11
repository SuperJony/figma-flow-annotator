import {
  type BuildCleanStaleIndexesOperationBatchInput,
  CONNECTORS_CONTAINER_NAME,
  decodeConnectorReferenceIds,
  decodeFlowConnectorRecord,
  type FlowConnectorAuthoringEndpointInput,
  type FlowConnectorRecord,
  type FlowConnectorValidationConnectorInput,
  type FlowConnectorValidationEndpointInput,
  flowConnectorMatchesDirectedPair,
  getFlowConnectorValidationIndexNodeIds,
  SHARED_PLUGIN_DATA,
  type ValidateFlowConnectorReferencesInput,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";

export interface FlowConnectorCurrentPageRuntime {
  namespace: string;
  findContextFrameId(node: SceneNode): string;
  getVisibleBounds(node: SceneNode): Rect;
}

export interface FlowConnectorSnapshotRecord {
  node: GroupNode;
  record: FlowConnectorRecord;
}

export interface FlowConnectorCurrentPageSnapshot {
  connectorRecords: FlowConnectorSnapshotRecord[];
  namespace: string;
}

export interface FlowConnectorValidationSnapshot extends FlowConnectorCurrentPageSnapshot {
  validationNodes: SceneNode[];
}

export function collectFlowConnectorCurrentPageSnapshot(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): FlowConnectorCurrentPageSnapshot {
  const container = findFlowConnectorsContainer(runtime);
  return {
    connectorRecords:
      container === null
        ? []
        : container.children.flatMap((child) => {
            if (
              child.type !== "GROUP" ||
              child.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) !==
                VISUAL_NODE_KINDS.flowConnector
            ) {
              return [];
            }

            const record = readFlowConnectorRecord(child, runtime);
            return record === null ? [] : [{ node: child, record }];
          }),
    namespace: runtime.namespace,
  };
}

export async function collectDeepAuditFlowConnectorCurrentPageSnapshot(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): Promise<FlowConnectorValidationSnapshot> {
  const connectorRefNodeIds = figma.currentPage
    .findAllWithCriteria({
      sharedPluginData: {
        namespace: runtime.namespace,
        keys: [SHARED_PLUGIN_DATA.keys.connectorRefs],
      },
    })
    .map((node) => node.id);
  return collectBoundedFlowConnectorValidationSnapshot(runtime, connectorRefNodeIds);
}

export async function collectBoundedFlowConnectorValidationSnapshot(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
  candidateNodeIds: Iterable<string> = [],
): Promise<FlowConnectorValidationSnapshot> {
  const currentPage = figma.currentPage;
  const getNodeByIdAsync = figma.getNodeByIdAsync.bind(figma);
  const snapshot = collectFlowConnectorCurrentPageSnapshot(runtime);
  const nodeIds = new Set(candidateNodeIds);

  snapshot.connectorRecords.forEach((connector) => {
    const indexNodeIds = getFlowConnectorValidationIndexNodeIds(connector.record);
    addNodeIds(nodeIds, indexNodeIds.flowEndpointNodeIds);
    addNodeIds(nodeIds, indexNodeIds.contextFrameIds);
    addNodeIds(nodeIds, indexNodeIds.ownerContextFrameIds);
  });
  // Ordinary validation intentionally does not discover unknown reverse refs by scanning
  // shared plugin data across the page. Deep audit/indexed repair nodes own that slower path.

  const validationNodes = await getExistingSceneNodesById(
    nodeIds,
    currentPage.id,
    getNodeByIdAsync,
  );
  return {
    ...snapshot,
    validationNodes,
  };
}

export function getSelectedFlowConnectorRoots(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): GroupNode[] {
  return figma.currentPage.selection.flatMap((node) => {
    if (
      node.type !== "GROUP" ||
      node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) !==
        VISUAL_NODE_KINDS.flowConnector
    ) {
      return [];
    }

    return [node];
  });
}

export function findExistingDirectedConnectorInSnapshot(
  snapshot: FlowConnectorCurrentPageSnapshot,
  startNodeId: string,
  endNodeId: string,
): FlowConnectorSnapshotRecord | null {
  return (
    snapshot.connectorRecords.find((connector) =>
      flowConnectorMatchesDirectedPair(connector.record, startNodeId, endNodeId),
    ) ?? null
  );
}

export function toFlowConnectorReferenceValidationInput(
  snapshot: FlowConnectorValidationSnapshot,
): ValidateFlowConnectorReferencesInput {
  const connectors: FlowConnectorValidationConnectorInput[] = snapshot.connectorRecords.map(
    (connector) => ({
      nodeId: connector.node.id,
      record: connector.record,
    }),
  );
  const endpoints: FlowConnectorValidationEndpointInput[] = snapshot.validationNodes.map(
    (node) => ({
      connectorIds: readConnectorReferenceIds(node, snapshot.namespace),
      isEligibleFlowEndpoint: isFlowEndpointEligibleNode(node, snapshot.namespace),
      nodeId: node.id,
    }),
  );

  return { connectors, endpoints };
}

export function toCleanStaleIndexesInput(
  snapshot: FlowConnectorValidationSnapshot,
): BuildCleanStaleIndexesOperationBatchInput {
  const connectorInput = toFlowConnectorReferenceValidationInput(snapshot);
  return {
    endpoints: connectorInput.endpoints,
    liveConnectorIds: connectorInput.connectors.map((connector) => connector.record.id),
  };
}

export function readFlowConnectorRecord(
  node: BaseNode,
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): FlowConnectorRecord | null {
  return decodeFlowConnectorRecord(
    node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.connector),
  );
}

export function toFlowConnectorAuthoringEndpoint(
  node: SceneNode,
  runtime: FlowConnectorCurrentPageRuntime,
): FlowConnectorAuthoringEndpointInput {
  return {
    bounds: runtime.getVisibleBounds(node),
    contextFrameId: runtime.findContextFrameId(node),
    hasGeneratedAncestor: hasGeneratedAncestorInNamespace(node, runtime.namespace),
    id: node.id,
    name: node.name,
  };
}

function findFlowConnectorsContainer(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): FrameNode | null {
  for (const child of figma.currentPage.children) {
    if (
      child.type === "FRAME" &&
      child.name === CONNECTORS_CONTAINER_NAME &&
      child.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) ===
        VISUAL_NODE_KINDS.container
    ) {
      return child;
    }
  }
  return null;
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

function isFlowEndpointEligibleNode(node: SceneNode, namespace: string): boolean {
  return (
    node.getSharedPluginData(namespace, SHARED_PLUGIN_DATA.keys.kind) === "" &&
    !hasGeneratedAncestorInNamespace(node, namespace)
  );
}

function readConnectorReferenceIds(node: BaseNode, namespace: string): string[] {
  return decodeConnectorReferenceIds(
    node.getSharedPluginData(namespace, SHARED_PLUGIN_DATA.keys.connectorRefs),
  );
}

function hasGeneratedAncestorInNamespace(node: SceneNode, namespace: string): boolean {
  let current: BaseNode | null = node;
  while (current !== null && current.type !== "PAGE") {
    if (current.getSharedPluginData(namespace, SHARED_PLUGIN_DATA.keys.kind) !== "") {
      return true;
    }
    current = current.parent;
  }
  return false;
}
