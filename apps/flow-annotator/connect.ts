import {
  type AppendSharedReferenceOperation,
  buildCreateFlowConnectorPlan,
  buildRefreshFlowConnectorPlan,
  CONNECTORS_CONTAINER_NAME,
  type ConnectorObstacle,
  type CreateFlowConnectorOperation,
  type CreateFlowConnectorPlan,
  type FlowConnectorRecord,
  flowConnectorMatchesDirectedPair,
  isFlowEndpointEligibleVisualKind,
  mergeConnectorReferenceIds,
  type Point,
  planConnectorTrunks,
  type RectLike,
  type RefreshFlowConnectorPlan,
  routeOrthogonalConnector,
  SHARED_PLUGIN_DATA,
  type UpdateFlowConnectorOperation,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import { createConnectorVisualNodes } from "./connector-visual";
import { resolveContainer, resolvePlanTarget, writeSharedPluginData } from "./figma-plan-adapter";

interface ConnectorObstacleTraversalItem {
  node: SceneNode;
  generatedAncestor: boolean;
  coveringObstacles: RectLike[];
}

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

let observedSelectedEndpointIds = new Set<string>();
let connectorEndpointWindowNodes: SceneNode[] = [];

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
  const plan = buildCreateFlowConnectorPlan({
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
  const connectorRoot = applyCreateFlowConnectorPlan(
    plan,
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
  const plan = buildRefreshFlowConnectorPlan({
    connectorNodeId: connector.node.id,
    endName: endNode.name,
    now: new Date().toISOString(),
    record: connector.record,
    routePoints,
    startName: startNode.name,
  });

  return applyRefreshFlowConnectorPlan(
    plan,
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

function applyCreateFlowConnectorPlan(
  plan: CreateFlowConnectorPlan,
  runtime: ConnectRuntime,
  existingNodes: Map<string, BaseNode>,
): GroupNode {
  const containers = new Map<string, FrameNode>();
  const createdNodes = new Map<string, SceneNode>();

  plan.operations.forEach((operation) => {
    if (operation.type === "ensure-container") {
      containers.set(operation.ref, runtime.ensureContainer(operation.name));
      return;
    }

    if (operation.type === "set-shared-plugin-data") {
      const node = resolvePlanTarget(operation.target, { containers, createdNodes, existingNodes });
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

    throw new Error(`Flow Connector adapter cannot apply ${operation.type}.`);
  });

  if (plan.mode === "create") {
    const connectorRoot = createdNodes.get(plan.createdNodeRefs[0]);
    if (connectorRoot === undefined || connectorRoot.type !== "GROUP") {
      throw new Error("Flow Connector plan did not create a connector root.");
    }
    return connectorRoot;
  }

  return resolveExistingConnectorRoot(plan.existingNodeRefs[0], existingNodes);
}

function applyRefreshFlowConnectorPlan(
  plan: RefreshFlowConnectorPlan,
  runtime: ConnectRuntime,
  existingNodes: Map<string, BaseNode>,
): GroupNode {
  plan.operations.forEach((operation) => {
    if (operation.type === "update-flow-connector") {
      updateFlowConnectorRoot(
        resolveExistingConnectorRoot(operation.targetNodeId, existingNodes),
        operation,
        runtime,
      );
      return;
    }

    if (operation.type === "set-shared-plugin-data") {
      const node = resolvePlanTarget(operation.target, {
        containers: new Map(),
        createdNodes: new Map(),
        existingNodes,
      });
      writeSharedPluginData(node, operation, runtime.namespace);
      return;
    }

    throw new Error(`Flow Connector refresh adapter cannot apply ${operation.type}.`);
  });

  return resolveExistingConnectorRoot(plan.existingNodeRefs[0], existingNodes);
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
  const trunkPlan = planConnectorTrunks({
    connectors: connectors.map((connector) => ({
      record: connector.record,
    })),
  });
  const assignmentByConnectorId = new Map(
    trunkPlan.assignments.map((assignment) => [assignment.connectorId, assignment]),
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
    throw new Error(`Flow Connector plan references missing connector root ${nodeId}.`);
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
    throw new Error("Flow Connector adapter can only apply connector reverse references.");
  }

  const node = existingNodes.get(operation.targetNodeId);
  if (node === undefined) {
    throw new Error(
      `Flow Connector plan references missing Flow Endpoint ${operation.targetNodeId}.`,
    );
  }
  const record = mergeConnectorReferenceIds(readConnectorReferenceIds(node, runtime), operation.id);
  node.setSharedPluginData(
    runtime.namespace,
    SHARED_PLUGIN_DATA.keys.connectorRefs,
    JSON.stringify(record),
  );
}

function readConnectorReferenceIds(node: BaseNode, runtime: ConnectRuntime): string[] {
  const parsed = parseJson(
    node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.connectorRefs),
  );
  if (!isRecord(parsed) || !Array.isArray(parsed.connectorIds)) {
    return [];
  }
  return parsed.connectorIds.filter((value): value is string => typeof value === "string");
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

export function swapPendingConnectorEndpoints(runtime: ConnectRuntime): void {
  const endpoints = getPendingConnectorEndpointNodes(runtime);
  if (endpoints.length !== 2) {
    throw new Error("Swap requires exactly two pending Flow Endpoints.");
  }
  connectorEndpointWindowNodes = [endpoints[1], endpoints[0]];
  runtime.postSelectionState();
}

function parseJson(value: string): unknown {
  if (value.length === 0) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (_error: unknown) {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findExistingDirectedConnector(
  startNodeId: string,
  endNodeId: string,
  runtime: ConnectRuntime,
): { node: GroupNode; record: FlowConnectorRecord } | null {
  return (
    getFlowConnectorRecords(runtime).find((connector) =>
      flowConnectorMatchesDirectedPair(connector.record, startNodeId, endNodeId),
    ) ?? null
  );
}

function getFlowConnectorRecords(
  runtime: ConnectRuntime,
): { node: GroupNode; record: FlowConnectorRecord }[] {
  const container = findConnectorsContainer(runtime);
  if (container === null) {
    return [];
  }

  return container.children.flatMap((child) => {
    if (
      child.type !== "GROUP" ||
      child.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) !==
        VISUAL_NODE_KINDS.flowConnector
    ) {
      return [];
    }

    const record = readFlowConnectorRecord(child, runtime);
    return record === null ? [] : [{ node: child, record }];
  });
}

function getSelectedFlowConnectorRoots(runtime: ConnectRuntime): GroupNode[] {
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

function findConnectorsContainer(runtime: ConnectRuntime): FrameNode | null {
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

function readFlowConnectorRecord(
  node: BaseNode,
  runtime: ConnectRuntime,
): FlowConnectorRecord | null {
  const parsed = parseJson(
    node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.connector),
  );
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.id !== "string" ||
    !isFlowEndpointRecord(parsed.start) ||
    !isFlowEndpointRecord(parsed.end) ||
    typeof parsed.ownerContextFrameId !== "string" ||
    !(typeof parsed.flowAction === "string" || parsed.flowAction === null) ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    id: parsed.id,
    start: parsed.start,
    end: parsed.end,
    ownerContextFrameId: parsed.ownerContextFrameId,
    flowAction: parsed.flowAction,
    ...(isRouteCacheRecord(parsed.routeCache) ? { routeCache: parsed.routeCache } : {}),
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
}

function isFlowEndpointRecord(value: unknown): value is { nodeId: string; contextFrameId: string } {
  return (
    isRecord(value) && typeof value.nodeId === "string" && typeof value.contextFrameId === "string"
  );
}

function isRouteCacheRecord(value: unknown): value is { schemaVersion: 1; points: Point[] } {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    Array.isArray(value.points) &&
    value.points.every(
      (point) => isRecord(point) && typeof point.x === "number" && typeof point.y === "number",
    )
  );
}

export function collectConnectorObstacles(
  startNode: SceneNode,
  endNode: SceneNode,
  runtime: ConnectRuntime,
): ConnectorObstacle[] {
  const obstacles: ConnectorObstacle[] = [];
  const startAncestorIds = getAncestorIds(startNode);
  const endAncestorIds = getAncestorIds(endNode);
  const pending: ConnectorObstacleTraversalItem[] = figma.currentPage.children.map((node) => ({
    node,
    generatedAncestor: false,
    coveringObstacles: [],
  }));

  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    const node = item.node;
    if (node === startNode || node === endNode) {
      continue;
    }

    const kind = node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind);
    const nodeContainsEndpoint = startAncestorIds.has(node.id) || endAncestorIds.has(node.id);
    let generatedAncestor = item.generatedAncestor;
    let coveringObstacles = item.coveringObstacles;
    let wholeFrameObstacle = false;

    if (
      kind === VISUAL_NODE_KINDS.annotationCard &&
      !nodeContainsEndpoint &&
      node.absoluteBoundingBox !== null
    ) {
      generatedAncestor = true;
      coveringObstacles = appendUncoveredObstacle(obstacles, coveringObstacles, {
        id: node.id,
        kind: "annotation-card",
        rect: node.absoluteBoundingBox,
      });
    } else if (kind !== "" || generatedAncestor) {
      generatedAncestor = true;
    } else if (
      node.type === "FRAME" &&
      !nodeContainsEndpoint &&
      node.absoluteBoundingBox !== null
    ) {
      wholeFrameObstacle = true;
      coveringObstacles = appendUncoveredObstacle(obstacles, coveringObstacles, {
        id: node.id,
        kind: "context-frame",
        rect: node.absoluteBoundingBox,
      });
    }

    if (generatedAncestor || wholeFrameObstacle || !("children" in node)) {
      continue;
    }

    node.children.forEach((child) => {
      pending.push({
        node: child,
        generatedAncestor,
        coveringObstacles,
      });
    });
  }

  return obstacles;
}

function appendUncoveredObstacle(
  obstacles: ConnectorObstacle[],
  coveringObstacles: RectLike[],
  candidate: ConnectorObstacle,
): RectLike[] {
  // Descendant obstacles fully inside an ancestor cannot add routing constraints.
  if (isCoveredByObstacle(candidate.rect, coveringObstacles)) {
    return coveringObstacles;
  }

  obstacles.push(candidate);
  return [...coveringObstacles, candidate.rect];
}

function isCoveredByObstacle(candidate: RectLike, coveringObstacles: RectLike[]): boolean {
  return coveringObstacles.some((obstacle) => rectContainsRect(obstacle, candidate));
}

function rectContainsRect(outer: RectLike, inner: RectLike): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function getAncestorIds(node: BaseNode): Set<string> {
  const ids = new Set<string>();
  let current = node.parent;
  while (current !== null && current.type !== "PAGE") {
    ids.add(current.id);
    current = current.parent;
  }
  return ids;
}

export function handleSelectionChange(runtime: ConnectRuntime): void {
  recordRuntimeConnectorEndpointSelection(runtime);
  runtime.postSelectionState();
}

function recordRuntimeConnectorEndpointSelection(runtime: ConnectRuntime): void {
  const selectedEndpoints = getSelectedConnectorEndpoints(runtime);
  const selectedEndpointIds = selectedEndpoints.map((node) => node.id);
  const nextObservedSelectedEndpointIds = new Set(selectedEndpointIds);
  const newlySelectedEndpoints = selectedEndpoints.filter(
    (node) => !observedSelectedEndpointIds.has(node.id),
  );

  // Multiple additions in one event have no reliable relative order from Figma.
  if (newlySelectedEndpoints.length === 1) {
    pushConnectorEndpointNode(newlySelectedEndpoints[0]);
  } else if (
    connectorEndpointWindowNodes.length === 2 &&
    newlySelectedEndpoints.length > 1 &&
    selectedEndpoints.length === 2
  ) {
    // Figma duplicate replaces the selection with multiple new nodes in one event.
    // Keeping the old window would connect unselected endpoints.
    connectorEndpointWindowNodes = selectedEndpoints;
  }

  observedSelectedEndpointIds = nextObservedSelectedEndpointIds;
  pruneConnectorEndpointWindow(runtime);
}

function pushConnectorEndpointNode(node: SceneNode): void {
  connectorEndpointWindowNodes = [
    ...connectorEndpointWindowNodes.filter((existingNode) => existingNode.id !== node.id),
    node,
  ].slice(-2);
}

function getSelectedConnectorEndpointIds(runtime: ConnectRuntime): string[] {
  return getSelectedConnectorEndpoints(runtime).map((node) => node.id);
}

export function getPendingConnectorEndpointNodes(runtime: ConnectRuntime): SceneNode[] {
  return pruneConnectorEndpointWindow(runtime);
}

function pruneConnectorEndpointWindow(runtime: ConnectRuntime): SceneNode[] {
  connectorEndpointWindowNodes = connectorEndpointWindowNodes.filter(
    (node) => !node.removed && isConnectorEndpoint(node, runtime),
  );
  return [...connectorEndpointWindowNodes];
}

function getSelectedConnectorEndpoints(runtime: ConnectRuntime): SceneNode[] {
  return figma.currentPage.selection.filter(
    (node) => !node.removed && isConnectorEndpoint(node, runtime),
  );
}

function isConnectorEndpoint(node: SceneNode, runtime: ConnectRuntime): boolean {
  return (
    isFlowEndpointEligibleVisualKind(
      node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind),
    ) && !runtime.hasGeneratedAncestor(node)
  );
}

export function resetObservedEndpointSelection(runtime: ConnectRuntime): void {
  connectorEndpointWindowNodes = [];
  observedSelectedEndpointIds = new Set(getSelectedConnectorEndpointIds(runtime));
}
