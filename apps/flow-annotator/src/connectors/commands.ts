import {
  type AppendSharedReferenceOperation,
  buildCreateFlowConnectorOperationBatch,
  buildRefreshFlowConnectorOperationBatch,
  type CreateFlowConnectorOperation,
  type CreateFlowConnectorOperationBatch,
  type FlowConnectorRecord,
  groupConnectorTrunks,
  mergeConnectorReferenceIds,
  type RefreshFlowConnectorOperationBatch,
  routeOrthogonalConnector,
  SHARED_PLUGIN_DATA,
  type UpdateFlowConnectorOperation,
} from "@figma-flow-annotator/core";
import {
  resolveContainer,
  resolveOperationTarget,
  writeSharedPluginData,
} from "../figma/file-operations";
import { collectConnectorObstacles } from "./obstacles";
import {
  findExistingDirectedConnector,
  getFlowConnectorRecords,
  getSelectedFlowConnectorRoots,
  readConnectorReferenceIds,
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
  if (endpoints.length !== 2) {
    throw new Error("Create Flow Connector requires exactly two runtime-selected Flow Endpoints.");
  }

  const [startNode, endNode] = endpoints;
  if (runtime.hasGeneratedAncestor(startNode) || runtime.hasGeneratedAncestor(endNode)) {
    throw new Error("Flow Endpoints must be non-generated Figma nodes.");
  }

  const startBounds = runtime.getVisibleBounds(startNode);
  const endBounds = runtime.getVisibleBounds(endNode);
  const startContextFrameId = runtime.findContextFrameId(startNode);
  const endContextFrameId = runtime.findContextFrameId(endNode);
  const routePoints = routeOrthogonalConnector({
    startRect: startBounds,
    endRect: endBounds,
    obstacles: collectConnectorObstacles(startNode, endNode, runtime),
  }).points;
  const existingConnector = findExistingDirectedConnector(startNode.id, endNode.id, runtime);
  const connectorId = existingConnector?.record.id ?? runtime.createId("connector");
  const now = new Date().toISOString();
  const batch = buildCreateFlowConnectorOperationBatch({
    connectorId,
    ...(existingConnector === null
      ? {}
      : {
          existingConnector: {
            nodeId: existingConnector.node.id,
            record: existingConnector.record,
          },
        }),
    start: {
      id: startNode.id,
      name: startNode.name,
      contextFrameId: startContextFrameId,
    },
    end: {
      id: endNode.id,
      name: endNode.name,
      contextFrameId: endContextFrameId,
    },
    ownerContextFrameId: startContextFrameId,
    flowAction: flowActionValue,
    routePoints,
    now,
  });
  const connectorRoot = applyCreateFlowConnectorOperationBatch(
    batch,
    runtime,
    new Map([
      [startNode.id, startNode],
      [endNode.id, endNode],
      ...(existingConnector === null
        ? []
        : [[existingConnector.node.id, existingConnector.node] as [string, BaseNode]]),
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
  const routePoints = routeOrthogonalConnector({
    startRect: runtime.getVisibleBounds(startNode),
    endRect: runtime.getVisibleBounds(endNode),
    obstacles: collectConnectorObstacles(startNode, endNode, runtime),
  }).points;
  const batch = buildRefreshFlowConnectorOperationBatch({
    connectorNodeId: connector.node.id,
    endName: endNode.name,
    now: new Date().toISOString(),
    record: connector.record,
    routePoints,
    startName: startNode.name,
  });

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

function applyCreateFlowConnectorOperationBatch(
  batch: CreateFlowConnectorOperationBatch,
  runtime: ConnectRuntime,
  existingNodes: Map<string, BaseNode>,
): GroupNode {
  const containers = new Map<string, FrameNode>();
  const createdNodes = new Map<string, SceneNode>();

  batch.operations.forEach((operation) => {
    if (operation.type === "ensure-container") {
      containers.set(operation.ref, runtime.ensureContainer(operation.name));
      return;
    }

    if (operation.type === "set-shared-plugin-data") {
      const node = resolveOperationTarget(operation.target, {
        containers,
        createdNodes,
        existingNodes,
      });
      writeSharedPluginData(node, operation, runtime.namespace);
      return;
    }

    if (operation.type === "create-flow-connector") {
      const container = resolveContainer(operation.containerRef, containers);
      createdNodes.set(operation.ref, createFlowConnectorRoot(container, operation, runtime));
      return;
    }

    if (operation.type === "update-flow-connector") {
      updateFlowConnectorRoot(
        resolveExistingConnectorRoot(operation.targetNodeId, existingNodes),
        operation,
        runtime,
      );
      return;
    }

    if (operation.type === "append-shared-reference") {
      appendConnectorReference(existingNodes, runtime, operation);
      return;
    }

    throw new Error(`Flow Connector command writer cannot apply ${operation.type}.`);
  });

  if (batch.mode === "create") {
    const connectorRoot = createdNodes.get(batch.createdNodeRefs[0]);
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
  batch.operations.forEach((operation) => {
    if (operation.type === "update-flow-connector") {
      updateFlowConnectorRoot(
        resolveExistingConnectorRoot(operation.targetNodeId, existingNodes),
        operation,
        runtime,
      );
      return;
    }

    if (operation.type === "set-shared-plugin-data") {
      const node = resolveOperationTarget(operation.target, {
        containers: new Map(),
        createdNodes: new Map(),
        existingNodes,
      });
      writeSharedPluginData(node, operation, runtime.namespace);
      return;
    }

    throw new Error(`Flow Connector refresh writer cannot apply ${operation.type}.`);
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

function appendConnectorReference(
  existingNodes: Map<string, BaseNode>,
  runtime: ConnectRuntime,
  operation: AppendSharedReferenceOperation,
): void {
  if (
    operation.key !== SHARED_PLUGIN_DATA.keys.connectorRefs ||
    operation.listKey !== "connectorIds"
  ) {
    throw new Error("Flow Connector command writer can only apply connector reverse references.");
  }

  const node = existingNodes.get(operation.targetNodeId);
  if (node === undefined) {
    throw new Error(
      `Flow Connector operation batch references missing Flow Endpoint ${operation.targetNodeId}.`,
    );
  }
  const record = mergeConnectorReferenceIds(readConnectorReferenceIds(node, runtime), operation.id);
  node.setSharedPluginData(
    runtime.namespace,
    SHARED_PLUGIN_DATA.keys.connectorRefs,
    JSON.stringify(record),
  );
}

export {
  collectConnectorObstacles,
  getPendingConnectorEndpointNodes,
  handleSelectionChange,
  resetObservedEndpointSelection,
  swapPendingConnectorEndpoints,
};
