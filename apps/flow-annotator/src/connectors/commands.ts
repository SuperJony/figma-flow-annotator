import {
  type CreateFlowConnectorOperation,
  type CreateFlowConnectorOperationBatch,
  type FlowConnectorRecord,
  groupConnectorTrunks,
  planCreateFlowConnectorAuthoring,
  planRefreshFlowConnectorAuthoring,
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
  regenerateConnectorVisuals(runtime);
  runtime.ensureLayerOrder();
  return connectorRoot;
}

export async function refreshFlowConnectors(
  runtime: ConnectRuntime,
): Promise<RefreshConnectorsResult> {
  const refreshedNodes: GroupNode[] = [];
  const failures: string[] = [];
  const selectedConnectorRoots = getSelectedFlowConnectorRoots(runtime);
  const selectedOnly = selectedConnectorRoots.length > 0;
  const connectorRecords = selectedOnly
    ? selectedConnectorRoots.flatMap((node) => {
        const record = readFlowConnectorRecord(node, runtime);
        if (record === null) {
          failures.push(`${node.name}: Missing Flow Connector record.`);
          return [];
        }
        return [{ node, record }];
      })
    : getFlowConnectorRecords(runtime);

  if (connectorRecords.length === 0 && failures.length === 0) {
    throw new Error("No Flow Connectors found to refresh.");
  }

  for (const connector of connectorRecords) {
    try {
      const refreshed = await refreshOneFlowConnector(connector, runtime);
      refreshedNodes.push(refreshed);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown connector refresh failure.";
      failures.push(`${connector.node.name}: ${errorMessage}`);
    }
  }

  if (refreshedNodes.length > 0) {
    regenerateConnectorVisuals(runtime);
    runtime.ensureLayerOrder();
  }

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

async function refreshOneFlowConnector(
  connector: { node: GroupNode; record: FlowConnectorRecord },
  runtime: ConnectRuntime,
): Promise<GroupNode> {
  const startNode = await getLiveSceneNode(connector.record.start.nodeId, "start Flow Endpoint");
  const endNode = await getLiveSceneNode(connector.record.end.nodeId, "end Flow Endpoint");
  const plan = planRefreshFlowConnectorAuthoring({
    connectorNodeId: connector.node.id,
    end: toAuthoringEndpoint(endNode, runtime),
    now: new Date().toISOString(),
    obstacles: collectConnectorObstacles(startNode, endNode, runtime),
    record: connector.record,
    start: toAuthoringEndpoint(startNode, runtime),
  });
  const batch = plan.batch;

  return applyRefreshFlowConnectorOperationBatch(
    batch,
    runtime,
    new Map([[connector.node.id, connector.node]]),
  );
}

async function getLiveSceneNode(nodeId: string, role: string): Promise<SceneNode> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (node === null || node.type === "PAGE" || !("absoluteBoundingBox" in node) || node.removed) {
    throw new Error(`Missing ${role} ${nodeId}.`);
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

function regenerateConnectorVisuals(runtime: ConnectRuntime): void {
  const connectors = getFlowConnectorRecords(runtime).filter(
    (connector) => connector.record.routeCache !== undefined,
  );
  const trunkLayout = groupConnectorTrunks({
    connectors: connectors.map((connector) => ({
      record: connector.record,
    })),
  });
  const assignmentByConnectorId = new Map(
    trunkLayout.assignments.map((assignment) => [assignment.connectorId, assignment]),
  );

  connectors.forEach((connector) => {
    const routePoints = connector.record.routeCache?.points;
    if (routePoints === undefined) {
      return;
    }
    const assignment = assignmentByConnectorId.get(connector.record.id);
    const nextVisualNodes = createConnectorVisualNodes(
      routePoints,
      connector.record.flowAction ?? "",
      runtime,
      assignment === undefined ? {} : { sharedTrunkSegment: assignment.segment },
    );
    replaceConnectorVisualNodes(connector.node, nextVisualNodes);
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
