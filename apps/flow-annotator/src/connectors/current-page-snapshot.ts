import {
  type BuildCleanStaleIndexesOperationBatchInput,
  CONNECTORS_CONTAINER_NAME,
  decodeConnectorReferenceIds,
  decodeFlowConnectorRecord,
  type FlowConnectorAuthoringEndpointInput,
  type FlowConnectorRecord,
  type FlowConnectorRouteLayoutConnectorInput,
  type FlowConnectorRouteValidationConnectorInput,
  type FlowConnectorValidationConnectorInput,
  type FlowConnectorValidationEndpointInput,
  flowConnectorMatchesDirectedPair,
  SHARED_PLUGIN_DATA,
  type ValidateFlowConnectorReferencesInput,
  type ValidateFlowConnectorRouteGeometryInput,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import { collectCurrentPageNodes, getVisibleBounds } from "../figma/runtime";
import { collectConnectorObstacles } from "./obstacles";

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

export interface FullPageFlowConnectorCurrentPageSnapshot extends FlowConnectorCurrentPageSnapshot {
  pageNodes: SceneNode[];
  pageNodesById: Map<string, SceneNode>;
}

export interface FlowConnectorAuthoringSnapshot extends FlowConnectorCurrentPageSnapshot {
  endpoints: FlowConnectorAuthoringEndpointInput[];
  existingConnectors: { nodeId: string; record: FlowConnectorRecord }[];
  obstacles: ReturnType<typeof collectConnectorObstacles>;
}

export interface FlowConnectorRouteLayoutSnapshot extends FlowConnectorCurrentPageSnapshot {
  connectorNodesById: Map<string, GroupNode>;
  layoutConnectors: FlowConnectorRouteLayoutConnectorInput[];
  selectedOnly: boolean;
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

export function collectFullPageFlowConnectorCurrentPageSnapshot(
  runtime: Pick<FlowConnectorCurrentPageRuntime, "namespace">,
): FullPageFlowConnectorCurrentPageSnapshot {
  const pageNodes = collectCurrentPageNodes();
  return {
    ...collectFlowConnectorCurrentPageSnapshot(runtime),
    pageNodes,
    pageNodesById: new Map(pageNodes.map((node): [string, SceneNode] => [node.id, node])),
  };
}

export function collectFlowConnectorAuthoringSnapshot(
  endpoints: SceneNode[],
  runtime: FlowConnectorCurrentPageRuntime,
): FlowConnectorAuthoringSnapshot {
  const snapshot = collectFlowConnectorCurrentPageSnapshot(runtime);
  return {
    ...snapshot,
    endpoints: endpoints.map((endpoint) => toFlowConnectorAuthoringEndpoint(endpoint, runtime)),
    existingConnectors: snapshot.connectorRecords.map((connector) => ({
      nodeId: connector.node.id,
      record: connector.record,
    })),
    obstacles:
      endpoints.length === 2 ? collectConnectorObstacles(endpoints[0], endpoints[1], runtime) : [],
  };
}

export async function collectFlowConnectorRouteLayoutSnapshot(
  selectedConnectorRoots: GroupNode[],
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<FlowConnectorRouteLayoutSnapshot> {
  const snapshot = collectFlowConnectorCurrentPageSnapshot(runtime);
  return {
    ...snapshot,
    connectorNodesById: buildConnectorNodeMap(snapshot.connectorRecords, selectedConnectorRoots),
    layoutConnectors: await collectRouteLayoutConnectors(
      snapshot.connectorRecords,
      selectedConnectorRoots,
      runtime,
    ),
    selectedOnly: selectedConnectorRoots.length > 0,
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
  snapshot: FullPageFlowConnectorCurrentPageSnapshot,
): ValidateFlowConnectorReferencesInput {
  const connectors: FlowConnectorValidationConnectorInput[] = snapshot.connectorRecords.map(
    (connector) => ({
      nodeId: connector.node.id,
      record: connector.record,
    }),
  );
  const endpoints: FlowConnectorValidationEndpointInput[] = snapshot.pageNodes.map((node) => ({
    connectorIds: readConnectorReferenceIds(node, snapshot.namespace),
    isEligibleFlowEndpoint: isFlowEndpointEligibleNode(node, snapshot.namespace),
    nodeId: node.id,
  }));

  return { connectors, endpoints };
}

export function toFlowConnectorRouteValidationInput(
  snapshot: FullPageFlowConnectorCurrentPageSnapshot,
  runtime: FlowConnectorCurrentPageRuntime,
): ValidateFlowConnectorRouteGeometryInput {
  const connectors: FlowConnectorRouteValidationConnectorInput[] = snapshot.connectorRecords.map(
    (connector) => {
      const startNode = snapshot.pageNodesById.get(connector.record.start.nodeId);
      const endNode = snapshot.pageNodesById.get(connector.record.end.nodeId);
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

export function toCleanStaleIndexesInput(
  snapshot: FullPageFlowConnectorCurrentPageSnapshot,
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

async function collectRouteLayoutConnectors(
  connectorRecords: FlowConnectorSnapshotRecord[],
  selectedConnectorRoots: GroupNode[],
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<FlowConnectorRouteLayoutConnectorInput[]> {
  if (selectedConnectorRoots.length === 0) {
    return Promise.all(
      connectorRecords.map((connector) => toRouteLayoutConnector(connector, true, runtime)),
    );
  }

  const recordsByNodeId = new Map(
    connectorRecords.map((connector) => [connector.node.id, connector]),
  );
  const selectedNodeIds = new Set(selectedConnectorRoots.map((node) => node.id));
  const selectedConnectors = selectedConnectorRoots.map((node) => ({
    node,
    record: recordsByNodeId.get(node.id)?.record ?? readFlowConnectorRecord(node, runtime),
  }));
  const remainingConnectors = connectorRecords.filter(
    (connector) => !selectedNodeIds.has(connector.node.id),
  );

  return [
    ...(await Promise.all(
      selectedConnectors.map((connector) => toRouteLayoutConnector(connector, true, runtime)),
    )),
    ...remainingConnectors.map((connector) => toRouteLayoutConnectorWithoutRuntimeFacts(connector)),
  ];
}

async function toRouteLayoutConnector(
  connector: { node: GroupNode; record: FlowConnectorRecord | null },
  includeRuntimeFacts: boolean,
  runtime: FlowConnectorCurrentPageRuntime,
): Promise<FlowConnectorRouteLayoutConnectorInput> {
  if (!includeRuntimeFacts || connector.record === null) {
    return toRouteLayoutConnectorWithoutRuntimeFacts(connector);
  }

  const startNode = await getLiveSceneNodeOrNull(connector.record.start.nodeId);
  const endNode = await getLiveSceneNodeOrNull(connector.record.end.nodeId);

  return {
    ...toRouteLayoutConnectorWithoutRuntimeFacts(connector),
    ...(startNode === null ? {} : { start: toFlowConnectorAuthoringEndpoint(startNode, runtime) }),
    ...(endNode === null ? {} : { end: toFlowConnectorAuthoringEndpoint(endNode, runtime) }),
    obstacles:
      startNode === null || endNode === null
        ? []
        : collectConnectorObstacles(startNode, endNode, runtime),
  };
}

function toRouteLayoutConnectorWithoutRuntimeFacts(connector: {
  node: GroupNode;
  record: FlowConnectorRecord | null;
}): FlowConnectorRouteLayoutConnectorInput {
  return {
    name: connector.node.name,
    nodeId: connector.node.id,
    record: connector.record,
  };
}

function buildConnectorNodeMap(
  connectorRecords: FlowConnectorSnapshotRecord[],
  selectedConnectorRoots: GroupNode[],
): Map<string, GroupNode> {
  return new Map(
    [...connectorRecords.map((connector) => connector.node), ...selectedConnectorRoots].map(
      (node) => [node.id, node],
    ),
  );
}

async function getLiveSceneNodeOrNull(nodeId: string): Promise<SceneNode | null> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (node === null || node.type === "PAGE" || !("absoluteBoundingBox" in node) || node.removed) {
    return null;
  }
  return node as SceneNode;
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
