import {
  type CreateFlowConnectorOperation,
  type CreateFlowConnectorOperationBatch,
  type FlowConnectorRecord,
  type FlowConnectorRouteLayoutConnectorInput,
  type FlowConnectorRouteRenderPlan,
  planCreateFlowConnectorAuthoring,
  planFlowConnectorRouteLayoutSet,
  planFlowConnectorRouteRenderSet,
  type RefreshFlowConnectorOperationBatch,
  type UpdateFlowConnectorOperation,
} from "@figma-flow-annotator/core";
import { applyFigmaFileOperationBatch } from "../figma/file-operations";
import { collectConnectorObstacles } from "./obstacles";
import {
  findExistingDirectedConnector,
  getFlowConnectorRecords,
  getSelectedFlowConnectorRoots,
  readFlowConnectorRecord,
} from "./records";
import {
  getPendingConnectorEndpointNodes,
  handleSelectionChange,
  resetObservedEndpointSelection,
  swapPendingConnectorEndpoints,
} from "./selection";
import { createConnectorVisualNodes } from "./visual";

export interface ConnectEndpointPreview {
  id: string;
  name: string;
}

export interface ExistingConnectorPreview {
  flowAction: string | null;
  id: string;
  nodeId: string;
}

export interface ConnectSelectionState {
  endpoints: ConnectEndpointPreview[];
  existingConnector: ExistingConnectorPreview | null;
  routingStatus: string;
}

export interface RefreshConnectorsResult {
  failedCount: number;
  failures: string[];
  refreshedCount: number;
  selectedOnly: boolean;
  nodes: GroupNode[];
}

export interface ConnectRuntime {
  namespace: string;
  createId(prefix: "connector"): string;
  createText(
    name: string,
    characters: string,
    fontSize: number,
    fills: SolidPaint,
    width: number,
  ): TextNode;
  ensureContainer(name: string): FrameNode;
  ensureLayerOrder(): void;
  findContextFrameId(node: SceneNode): string;
  getVisibleBounds(node: SceneNode): Rect;
  hasGeneratedAncestor(node: SceneNode): boolean;
  postSelectionState(): void;
  solidPaint(r: number, g: number, b: number): SolidPaint;
}

export function createFlowConnector(flowActionValue: string, runtime: ConnectRuntime): GroupNode {
  const endpoints = getPendingConnectorEndpointNodes(runtime);
  const existingConnectors = getFlowConnectorRecords(runtime);
  const now = new Date().toISOString();
  const plan = planCreateFlowConnectorAuthoring({
    createConnectorId: () => runtime.createId("connector"),
    endpoints: endpoints.map((endpoint) => toAuthoringEndpoint(endpoint, runtime)),
    existingConnectors: existingConnectors.map((connector) => ({
      nodeId: connector.node.id,
      record: connector.record,
    })),
    flowAction: flowActionValue,
    now,
    obstacles:
      endpoints.length === 2 ? collectConnectorObstacles(endpoints[0], endpoints[1], runtime) : [],
  });
  const [startNode, endNode] = endpoints;
  const batch = plan.batch;
  const connectorRoot = applyCreateFlowConnectorOperationBatch(
    batch,
    runtime,
    new Map([
      [startNode.id, startNode],
      [endNode.id, endNode],
      ...existingConnectors.map((connector): [string, BaseNode] => [
        connector.node.id,
        connector.node,
      ]),
    ]),
  );
  renderPlannedConnectorSet(runtime);
  runtime.ensureLayerOrder();
  return connectorRoot;
}

export async function refreshFlowConnectors(
  runtime: ConnectRuntime,
): Promise<RefreshConnectorsResult> {
  const refreshedNodes: GroupNode[] = [];
  const applyFailures: string[] = [];
  const selectedConnectorRoots = getSelectedFlowConnectorRoots(runtime);
  const selectedOnly = selectedConnectorRoots.length > 0;
  const connectorRecords = getFlowConnectorRecords(runtime);
  const layoutConnectors = await collectRouteLayoutConnectors(
    connectorRecords,
    selectedConnectorRoots,
    runtime,
  );

  if (layoutConnectors.length === 0) {
    throw new Error("No Flow Connectors found to refresh.");
  }

  const layoutPlan = planFlowConnectorRouteLayoutSet({
    connectors: layoutConnectors,
    now: new Date().toISOString(),
    ...(selectedOnly
      ? { selectedConnectorNodeIds: selectedConnectorRoots.map((node) => node.id) }
      : {}),
  });
  const connectorNodesById = buildConnectorNodeMap(connectorRecords, selectedConnectorRoots);

  for (const refresh of layoutPlan.refreshes) {
    try {
      const connectorNode = connectorNodesById.get(refresh.connectorNodeId);
      if (connectorNode === undefined) {
        throw new Error(`Missing Flow Connector root ${refresh.connectorNodeId}.`);
      }
      const refreshed = applyRefreshFlowConnectorOperationBatch(
        refresh.batch,
        runtime,
        new Map([[refresh.connectorNodeId, connectorNode]]),
      );
      refreshedNodes.push(refreshed);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown connector refresh failure.";
      const connectorName =
        connectorNodesById.get(refresh.connectorNodeId)?.name ?? refresh.connectorNodeId;
      applyFailures.push(`${connectorName}: ${errorMessage}`);
    }
  }

  if (refreshedNodes.length > 0) {
    if (applyFailures.length === 0) {
      renderPlannedConnectorSet(runtime, layoutPlan.renderConnectors, connectorNodesById);
    } else {
      renderPlannedConnectorSet(runtime);
    }
    runtime.ensureLayerOrder();
  }

  const failures = [
    ...layoutPlan.failures.map((failure) => `${failure.connectorName}: ${failure.message}`),
    ...applyFailures,
  ];

  return {
    failedCount: failures.length,
    failures,
    refreshedCount: refreshedNodes.length,
    selectedOnly,
    nodes: refreshedNodes,
  };
}

export function getConnectSelectionState(runtime: ConnectRuntime): ConnectSelectionState {
  const endpoints = getPendingConnectorEndpointNodes(runtime);
  const existingConnector =
    endpoints.length === 2
      ? findExistingDirectedConnector(endpoints[0].id, endpoints[1].id, runtime)
      : null;

  return {
    endpoints: endpoints.map((node) => ({
      id: node.id,
      name: node.name,
    })),
    existingConnector:
      existingConnector === null
        ? null
        : {
            flowAction: existingConnector.record.flowAction,
            id: existingConnector.record.id,
            nodeId: existingConnector.node.id,
          },
    routingStatus:
      endpoints.length === 2
        ? "Route preview pending router validation."
        : "Select two Flow Endpoints to preview a Connector Route.",
  };
}

async function getLiveSceneNodeOrNull(nodeId: string): Promise<SceneNode | null> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (node === null || node.type === "PAGE" || !("absoluteBoundingBox" in node) || node.removed) {
    return null;
  }
  return node as SceneNode;
}

function toAuthoringEndpoint(node: SceneNode, runtime: ConnectRuntime) {
  return {
    bounds: runtime.getVisibleBounds(node),
    contextFrameId: runtime.findContextFrameId(node),
    hasGeneratedAncestor: runtime.hasGeneratedAncestor(node),
    id: node.id,
    name: node.name,
  };
}

function applyCreateFlowConnectorOperationBatch(
  batch: CreateFlowConnectorOperationBatch,
  runtime: ConnectRuntime,
  existingNodes: Map<string, BaseNode>,
): GroupNode {
  const applied = applyFigmaFileOperationBatch({
    batch,
    existingNodes,
    namespace: runtime.namespace,
    writer: {
      createFlowConnector: (container, operation) =>
        createFlowConnectorRoot(container, operation, runtime),
      ensureContainer: runtime.ensureContainer,
      updateFlowConnector: (operation) =>
        updateFlowConnectorRoot(
          resolveExistingConnectorRoot(operation.targetNodeId, existingNodes),
          operation,
          runtime,
        ),
    },
  });

  if (batch.mode === "create") {
    const connectorRoot = applied.createdNodes.get(batch.createdNodeRefs[0]);
    if (connectorRoot === undefined || connectorRoot.type !== "GROUP") {
      throw new Error("Flow Connector operation batch did not create a connector root.");
    }
    return connectorRoot;
  }

  return resolveExistingConnectorRoot(batch.existingNodeRefs[0], existingNodes);
}

function applyRefreshFlowConnectorOperationBatch(
  batch: RefreshFlowConnectorOperationBatch,
  runtime: ConnectRuntime,
  existingNodes: Map<string, BaseNode>,
): GroupNode {
  applyFigmaFileOperationBatch({
    batch,
    existingNodes,
    namespace: runtime.namespace,
    writer: {
      updateFlowConnector: (operation) =>
        updateFlowConnectorRoot(
          resolveExistingConnectorRoot(operation.targetNodeId, existingNodes),
          operation,
          runtime,
        ),
    },
  });

  return resolveExistingConnectorRoot(batch.existingNodeRefs[0], existingNodes);
}

function createFlowConnectorRoot(
  container: FrameNode,
  operation: CreateFlowConnectorOperation,
  runtime: ConnectRuntime,
): GroupNode {
  const visualNodes = createConnectorVisualNodes(
    operation.routePoints,
    operation.flowAction ?? "",
    runtime,
  );
  const connectorRoot = figma.group(visualNodes, container);
  connectorRoot.name = operation.name;
  return connectorRoot;
}

function updateFlowConnectorRoot(
  connectorRoot: GroupNode,
  operation: UpdateFlowConnectorOperation,
  runtime: ConnectRuntime,
): void {
  const nextVisualNodes = createConnectorVisualNodes(
    operation.routePoints,
    operation.flowAction ?? "",
    runtime,
  );
  replaceConnectorVisualNodes(connectorRoot, nextVisualNodes);
  connectorRoot.name = operation.name;
}

async function collectRouteLayoutConnectors(
  connectorRecords: { node: GroupNode; record: FlowConnectorRecord }[],
  selectedConnectorRoots: GroupNode[],
  runtime: ConnectRuntime,
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
  runtime: ConnectRuntime,
): Promise<FlowConnectorRouteLayoutConnectorInput> {
  if (!includeRuntimeFacts || connector.record === null) {
    return toRouteLayoutConnectorWithoutRuntimeFacts(connector);
  }

  const startNode = await getLiveSceneNodeOrNull(connector.record.start.nodeId);
  const endNode = await getLiveSceneNodeOrNull(connector.record.end.nodeId);

  return {
    ...toRouteLayoutConnectorWithoutRuntimeFacts(connector),
    ...(startNode === null ? {} : { start: toAuthoringEndpoint(startNode, runtime) }),
    ...(endNode === null ? {} : { end: toAuthoringEndpoint(endNode, runtime) }),
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
  connectorRecords: { node: GroupNode; record: FlowConnectorRecord }[],
  selectedConnectorRoots: GroupNode[],
): Map<string, GroupNode> {
  return new Map(
    [...connectorRecords.map((connector) => connector.node), ...selectedConnectorRoots].map(
      (node) => [node.id, node],
    ),
  );
}

function renderPlannedConnectorSet(
  runtime: ConnectRuntime,
  renderConnectors?: FlowConnectorRouteRenderPlan[],
  connectorNodesById?: Map<string, GroupNode>,
): void {
  if (renderConnectors !== undefined && connectorNodesById !== undefined) {
    renderConnectorVisuals(renderConnectors, connectorNodesById, runtime);
    return;
  }

  const connectors = getFlowConnectorRecords(runtime);
  const renderSet = planFlowConnectorRouteRenderSet({
    connectors: connectors.map((connector) => ({
      nodeId: connector.node.id,
      record: connector.record,
    })),
  });
  renderConnectorVisuals(
    renderSet.renderConnectors,
    new Map(connectors.map((connector) => [connector.node.id, connector.node])),
    runtime,
  );
}

function renderConnectorVisuals(
  renderConnectors: FlowConnectorRouteRenderPlan[],
  connectorNodesById: Map<string, GroupNode>,
  runtime: ConnectRuntime,
): void {
  renderConnectors.forEach((connector) => {
    const connectorRoot = connectorNodesById.get(connector.connectorNodeId);
    if (connectorRoot === undefined) {
      return;
    }
    const nextVisualNodes = createConnectorVisualNodes(
      connector.routePoints,
      connector.flowAction ?? "",
      runtime,
      connector.sharedTrunkSegment === undefined
        ? {}
        : { sharedTrunkSegment: connector.sharedTrunkSegment },
    );
    replaceConnectorVisualNodes(connectorRoot, nextVisualNodes);
  });
}

function replaceConnectorVisualNodes(connectorRoot: GroupNode, nextVisualNodes: SceneNode[]): void {
  [...connectorRoot.children].forEach((child) => {
    child.remove();
  });
  nextVisualNodes.forEach((node) => {
    connectorRoot.appendChild(node);
  });
}

function resolveExistingConnectorRoot(
  nodeId: string,
  existingNodes: Map<string, BaseNode>,
): GroupNode {
  const node = existingNodes.get(nodeId);
  if (node === undefined || node.type !== "GROUP") {
    throw new Error(`Flow Connector operation batch references missing connector root ${nodeId}.`);
  }
  return node;
}

export {
  collectConnectorObstacles,
  getPendingConnectorEndpointNodes,
  handleSelectionChange,
  resetObservedEndpointSelection,
  swapPendingConnectorEndpoints,
};
