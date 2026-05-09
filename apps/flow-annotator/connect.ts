import { type Point, unionRects } from './geometry';
import {
  SHARED_PLUGIN_DATA,
  CONNECTORS_CONTAINER_NAME,
  VISUAL_NODE_KINDS,
  buildCreateFlowConnectorPlan,
  flowConnectorMatchesDirectedPair,
  isFlowEndpointEligibleVisualKind,
  mergeConnectorReferenceIds,
  serializeSharedPluginDataValue,
  type AppendSharedReferenceOperation,
  type CreateFlowConnectorOperation,
  type CreateFlowConnectorPlan,
  type DocumentNodeTarget,
  type FlowConnectorRecord,
  type SetSharedPluginDataOperation,
  type UpdateFlowConnectorOperation,
} from '../../packages/core/src/index';

const CONNECTOR_THICKNESS = 4;
const CONNECTOR_ROUTE_PADDING = 24;
const CONNECTOR_ENDPOINT_GAP = 32;
const CONNECTOR_ARROW_LENGTH = 18;
const CONNECTOR_ARROW_WIDTH = 16;
const CONNECTOR_COLOR = '#1F3A5A';
const FLOW_ACTION_LABEL_FILL = '#FAF2C7';
const FLOW_ACTION_LABEL_STROKE = '#B88A21';
const FLOW_ACTION_LABEL_TEXT = '#172438';
const FLOW_ACTION_LABEL_FONT_SIZE = 11;
const FLOW_ACTION_LABEL_PADDING_X = 10;
const FLOW_ACTION_LABEL_PADDING_Y = 6;
const FLOW_ACTION_LABEL_MIN_WIDTH = 56;
const FLOW_ACTION_LABEL_MIN_HEIGHT = 28;
const FLOW_ACTION_LABEL_MAX_BROWSER_TEXT_WIDTH = 160;
const FLOW_ACTION_LABEL_RADIUS = 6;
const ROUTE_EPSILON = 0.001;

type RouteDirection = -1 | 1;

interface ConnectorObstacleTraversalItem {
  node: SceneNode;
  generatedAncestor: boolean;
  coveringObstacles: Rect[];
}

export interface ConnectorRouteVisual {
  bounds: Rect;
  height: number;
  svg: string;
  width: number;
}

export interface FlowActionLabelVisual {
  center: Point;
  fill: string;
  fontSize: number;
  maxTextWidth: number;
  minHeight: number;
  minWidth: number;
  paddingX: number;
  paddingY: number;
  radius: number;
  stroke: string;
  text: string;
  textColor: string;
}

export interface ConnectorVisualModel {
  label: FlowActionLabelVisual | null;
  route: ConnectorRouteVisual;
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

export interface ConnectRuntime {
  namespace: string;
  createId(prefix: 'connector'): string;
  createText(name: string, characters: string, fontSize: number, fills: SolidPaint, width: number): TextNode;
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
    throw new Error('Create Flow Connector requires exactly two runtime-selected Flow Endpoints.');
  }

  const [startNode, endNode] = endpoints;
  if (runtime.hasGeneratedAncestor(startNode) || runtime.hasGeneratedAncestor(endNode)) {
    throw new Error('Flow Endpoints must be non-generated Figma nodes.');
  }

  const startBounds = runtime.getVisibleBounds(startNode);
  const endBounds = runtime.getVisibleBounds(endNode);
  const startContextFrameId = runtime.findContextFrameId(startNode);
  const endContextFrameId = runtime.findContextFrameId(endNode);
  const routePoints = buildOrthogonalRoute(startBounds, endBounds, collectConnectorObstacles(startNode, endNode, runtime));
  const existingConnector = findExistingDirectedConnector(startNode.id, endNode.id, runtime);
  const connectorId = existingConnector?.record.id ?? runtime.createId('connector');
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
  const connectorRoot = applyCreateFlowConnectorPlan(plan, runtime, new Map([
    [startNode.id, startNode],
    [endNode.id, endNode],
    ...(existingConnector === null ? [] : [[existingConnector.node.id, existingConnector.node] as [string, BaseNode]]),
  ]));
  runtime.ensureLayerOrder();
  return connectorRoot;
}

function applyCreateFlowConnectorPlan(
  plan: CreateFlowConnectorPlan,
  runtime: ConnectRuntime,
  existingNodes: Map<string, BaseNode>,
): GroupNode {
  const containers = new Map<string, FrameNode>();
  const createdNodes = new Map<string, SceneNode>();

  plan.operations.forEach((operation) => {
    if (operation.type === 'ensure-container') {
      containers.set(operation.ref, runtime.ensureContainer(operation.name));
      return;
    }

    if (operation.type === 'set-shared-plugin-data') {
      const node = resolvePlanTarget(operation.target, { containers, createdNodes, existingNodes });
      writeSharedPluginData(node, runtime, operation);
      return;
    }

    if (operation.type === 'create-flow-connector') {
      const container = resolveContainer(operation.containerRef, containers);
      createdNodes.set(operation.ref, createFlowConnectorRoot(container, operation, runtime));
      return;
    }

    if (operation.type === 'update-flow-connector') {
      updateFlowConnectorRoot(resolveExistingConnectorRoot(operation.targetNodeId, existingNodes), operation, runtime);
      return;
    }

    if (operation.type === 'append-shared-reference') {
      appendConnectorReference(existingNodes, runtime, operation);
      return;
    }

    throw new Error(`Flow Connector adapter cannot apply ${operation.type}.`);
  });

  if (plan.mode === 'create') {
    const connectorRoot = createdNodes.get(plan.createdNodeRefs[0]);
    if (connectorRoot === undefined || connectorRoot.type !== 'GROUP') {
      throw new Error('Flow Connector plan did not create a connector root.');
    }
    return connectorRoot;
  }

  return resolveExistingConnectorRoot(plan.existingNodeRefs[0], existingNodes);
}

function createFlowConnectorRoot(
  container: FrameNode,
  operation: CreateFlowConnectorOperation,
  runtime: ConnectRuntime,
): GroupNode {
  const visualNodes = createConnectorVisualNodes(operation.routePoints, operation.flowAction ?? '', runtime);
  const connectorRoot = figma.group(visualNodes, container);
  connectorRoot.name = operation.name;
  return connectorRoot;
}

function updateFlowConnectorRoot(
  connectorRoot: GroupNode,
  operation: UpdateFlowConnectorOperation,
  runtime: ConnectRuntime,
): void {
  [...connectorRoot.children].forEach((child) => {
    child.remove();
  });
  createConnectorVisualNodes(operation.routePoints, operation.flowAction ?? '', runtime).forEach((node) => {
    connectorRoot.appendChild(node);
  });
  connectorRoot.name = operation.name;
}

function resolveExistingConnectorRoot(nodeId: string, existingNodes: Map<string, BaseNode>): GroupNode {
  const node = existingNodes.get(nodeId);
  if (node === undefined || node.type !== 'GROUP') {
    throw new Error(`Flow Connector plan references missing connector root ${nodeId}.`);
  }
  return node;
}

function resolveContainer(ref: string, containers: Map<string, FrameNode>): FrameNode {
  const container = containers.get(ref);
  if (container === undefined) {
    throw new Error(`Flow Connector plan references missing container ${ref}.`);
  }
  return container;
}

function resolvePlanTarget(
  target: DocumentNodeTarget,
  refs: {
    containers: Map<string, FrameNode>;
    createdNodes: Map<string, SceneNode>;
    existingNodes: Map<string, BaseNode>;
  },
): BaseNode {
  if (target.kind === 'container') {
    return resolveContainer(target.ref, refs.containers);
  }

  if (target.kind === 'created-node') {
    const node = refs.createdNodes.get(target.ref);
    if (node === undefined) {
      throw new Error(`Flow Connector plan references missing created node ${target.ref}.`);
    }
    return node;
  }

  const node = refs.existingNodes.get(target.nodeId);
  if (node === undefined) {
    throw new Error(`Flow Connector plan references missing existing node ${target.nodeId}.`);
  }
  return node;
}

function writeSharedPluginData(
  node: BaseNode,
  runtime: ConnectRuntime,
  operation: SetSharedPluginDataOperation,
): void {
  node.setSharedPluginData(
    runtime.namespace,
    operation.key,
    serializeSharedPluginDataValue(operation.value),
  );
}

function appendConnectorReference(
  existingNodes: Map<string, BaseNode>,
  runtime: ConnectRuntime,
  operation: AppendSharedReferenceOperation,
): void {
  if (operation.key !== SHARED_PLUGIN_DATA.keys.connectorRefs || operation.listKey !== 'connectorIds') {
    throw new Error('Flow Connector adapter can only apply connector reverse references.');
  }

  const node = existingNodes.get(operation.targetNodeId);
  if (node === undefined) {
    throw new Error(`Flow Connector plan references missing Flow Endpoint ${operation.targetNodeId}.`);
  }
  const record = mergeConnectorReferenceIds(readConnectorReferenceIds(node, runtime), operation.id);
  node.setSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.connectorRefs, JSON.stringify(record));
}

function readConnectorReferenceIds(node: BaseNode, runtime: ConnectRuntime): string[] {
  const parsed = parseJson(node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.connectorRefs));
  if (!isRecord(parsed) || !Array.isArray(parsed.connectorIds)) {
    return [];
  }
  return parsed.connectorIds.filter((value): value is string => typeof value === 'string');
}

export function getConnectSelectionState(runtime: ConnectRuntime): ConnectSelectionState {
  const endpoints = getPendingConnectorEndpointNodes(runtime);
  const existingConnector = endpoints.length === 2
    ? findExistingDirectedConnector(endpoints[0].id, endpoints[1].id, runtime)
    : null;

  return {
    endpoints: endpoints.map((node) => ({
      id: node.id,
      name: node.name,
    })),
    existingConnector: existingConnector === null
      ? null
      : {
          flowAction: existingConnector.record.flowAction,
          id: existingConnector.record.id,
          nodeId: existingConnector.node.id,
        },
    routingStatus: endpoints.length === 2
      ? 'Route preview pending router validation.'
      : 'Select two Flow Endpoints to preview a Connector Route.',
  };
}

export function swapPendingConnectorEndpoints(runtime: ConnectRuntime): void {
  const endpoints = getPendingConnectorEndpointNodes(runtime);
  if (endpoints.length !== 2) {
    throw new Error('Swap requires exactly two pending Flow Endpoints.');
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
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findExistingDirectedConnector(
  startNodeId: string,
  endNodeId: string,
  runtime: ConnectRuntime,
): { node: GroupNode; record: FlowConnectorRecord } | null {
  return getFlowConnectorRecords(runtime).find((connector) =>
    flowConnectorMatchesDirectedPair(connector.record, startNodeId, endNodeId),
  ) ?? null;
}

function getFlowConnectorRecords(runtime: ConnectRuntime): { node: GroupNode; record: FlowConnectorRecord }[] {
  const container = findConnectorsContainer(runtime);
  if (container === null) {
    return [];
  }

  return container.children.flatMap((child) => {
    if (
      child.type !== 'GROUP' ||
      child.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) !== VISUAL_NODE_KINDS.flowConnector
    ) {
      return [];
    }

    const record = readFlowConnectorRecord(child, runtime);
    return record === null ? [] : [{ node: child, record }];
  });
}

function findConnectorsContainer(runtime: ConnectRuntime): FrameNode | null {
  for (const child of figma.currentPage.children) {
    if (
      child.type === 'FRAME' &&
      child.name === CONNECTORS_CONTAINER_NAME &&
      child.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind) === VISUAL_NODE_KINDS.container
    ) {
      return child;
    }
  }
  return null;
}

function readFlowConnectorRecord(node: BaseNode, runtime: ConnectRuntime): FlowConnectorRecord | null {
  const parsed = parseJson(node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.connector));
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.id !== 'string' ||
    !isFlowEndpointRecord(parsed.start) ||
    !isFlowEndpointRecord(parsed.end) ||
    typeof parsed.ownerContextFrameId !== 'string' ||
    !(typeof parsed.flowAction === 'string' || parsed.flowAction === null) ||
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.updatedAt !== 'string'
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
  return isRecord(value) && typeof value.nodeId === 'string' && typeof value.contextFrameId === 'string';
}

function isRouteCacheRecord(value: unknown): value is { schemaVersion: 1; points: Point[] } {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    Array.isArray(value.points) &&
    value.points.every((point) => isRecord(point) && typeof point.x === 'number' && typeof point.y === 'number')
  );
}

function createConnectorVisualNodes(points: Point[], flowAction: string, runtime: ConnectRuntime): SceneNode[] {
  const visual = buildConnectorVisualModel(points, flowAction);
  const nodes: SceneNode[] = [createConnectorRouteSvg(visual.route)];

  if (visual.label !== null) {
    nodes.push(createFlowActionLabel(visual.label, runtime));
  }

  return nodes;
}

export function buildConnectorVisualModel(points: Point[], flowAction: string): ConnectorVisualModel {
  const distinctPoints = compactPoints(points);
  if (distinctPoints.length < 2) {
    throw new Error('Connector route requires at least two points.');
  }

  const drawing = buildConnectorDrawing(distinctPoints);
  const allPoints = [...drawing.pathPoints, ...drawing.arrowPoints];
  const bounds = expandRect(unionRects(pointsToRects(allPoints)), CONNECTOR_THICKNESS + 2);
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const pathData = toSvgPathData(drawing.pathPoints, bounds);
  const arrowData = toSvgPolygonData(drawing.arrowPoints, bounds);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${pathData}" fill="none" stroke="${CONNECTOR_COLOR}" stroke-width="${CONNECTOR_THICKNESS}" stroke-linecap="round" stroke-linejoin="round"/><path d="${arrowData}" fill="${CONNECTOR_COLOR}"/></svg>`;
  const trimmedFlowAction = flowAction.trim();
  return {
    label: trimmedFlowAction.length > 0 ? buildFlowActionLabelVisual(distinctPoints, trimmedFlowAction) : null,
    route: {
      bounds,
      height,
      svg,
      width,
    },
  };
}

function createConnectorRouteSvg(visual: ConnectorRouteVisual): FrameNode {
  const route = figma.createNodeFromSvg(visual.svg);
  route.name = 'FFA Connector Route';
  route.x = visual.bounds.x;
  route.y = visual.bounds.y;
  route.clipsContent = false;
  return route;
}

function buildConnectorDrawing(points: Point[]): { pathPoints: Point[]; arrowPoints: Point[] } {
  const tip = points[points.length - 1];
  const previous = points[points.length - 2];
  const direction = normalize({
    x: tip.x - previous.x,
    y: tip.y - previous.y,
  });
  const baseCenter = {
    x: tip.x - direction.x * CONNECTOR_ARROW_LENGTH,
    y: tip.y - direction.y * CONNECTOR_ARROW_LENGTH,
  };
  const perpendicular = {
    x: -direction.y,
    y: direction.x,
  };
  const arrowHalfWidth = CONNECTOR_ARROW_WIDTH / 2;
  return {
    pathPoints: [...points.slice(0, -1), baseCenter],
    arrowPoints: [
      tip,
      {
        x: baseCenter.x + perpendicular.x * arrowHalfWidth,
        y: baseCenter.y + perpendicular.y * arrowHalfWidth,
      },
      {
        x: baseCenter.x - perpendicular.x * arrowHalfWidth,
        y: baseCenter.y - perpendicular.y * arrowHalfWidth,
      },
    ],
  };
}

function buildFlowActionLabelVisual(points: Point[], flowAction: string): FlowActionLabelVisual {
  return {
    center: getLongestSegmentMidpoint(points),
    fill: FLOW_ACTION_LABEL_FILL,
    fontSize: FLOW_ACTION_LABEL_FONT_SIZE,
    maxTextWidth: FLOW_ACTION_LABEL_MAX_BROWSER_TEXT_WIDTH,
    minHeight: FLOW_ACTION_LABEL_MIN_HEIGHT,
    minWidth: FLOW_ACTION_LABEL_MIN_WIDTH,
    paddingX: FLOW_ACTION_LABEL_PADDING_X,
    paddingY: FLOW_ACTION_LABEL_PADDING_Y,
    radius: FLOW_ACTION_LABEL_RADIUS,
    stroke: FLOW_ACTION_LABEL_STROKE,
    text: flowAction,
    textColor: FLOW_ACTION_LABEL_TEXT,
  };
}

function createFlowActionLabel(visual: FlowActionLabelVisual, runtime: ConnectRuntime): FrameNode {
  const label = figma.createFrame();
  const text = runtime.createText(
    'Flow Action',
    visual.text,
    visual.fontSize,
    hexToSolidPaint(visual.textColor),
    visual.maxTextWidth,
  );
  text.textAutoResize = 'WIDTH_AND_HEIGHT';

  label.name = 'FFA Flow Action Label';
  label.fills = [hexToSolidPaint(visual.fill)];
  label.strokes = [hexToSolidPaint(visual.stroke)];
  label.strokeWeight = 1;
  label.cornerRadius = visual.radius;
  label.clipsContent = false;
  label.resize(
    Math.max(visual.minWidth, text.width + visual.paddingX * 2),
    Math.max(visual.minHeight, text.height + visual.paddingY * 2),
  );
  label.x = visual.center.x - label.width / 2;
  label.y = visual.center.y - label.height / 2;

  label.appendChild(text);
  text.x = visual.paddingX;
  text.y = visual.paddingY;

  return label;
}

export function buildOrthogonalRoute(start: Rect, end: Rect, obstacles: Rect[]): Point[] {
  const startCenter = centerOf(start);
  const endCenter = centerOf(end);
  const deltaX = endCenter.x - startCenter.x;
  const deltaY = endCenter.y - startCenter.y;
  const expandedObstacles = obstacles.map((obstacle) => expandRect(obstacle, CONNECTOR_ROUTE_PADDING));
  const horizontalDirection = deltaX >= 0 ? 1 : -1;
  const verticalDirection = deltaY >= 0 ? 1 : -1;
  const dominantAxisCandidates = Math.abs(deltaX) >= Math.abs(deltaY)
    ? buildHorizontalRouteCandidates(start, end, expandedObstacles, horizontalDirection)
    : buildVerticalRouteCandidates(start, end, expandedObstacles, verticalDirection);
  const alternateAxisCandidates = Math.abs(deltaX) >= Math.abs(deltaY)
    ? buildVerticalRouteCandidates(start, end, expandedObstacles, verticalDirection)
    : buildHorizontalRouteCandidates(start, end, expandedObstacles, horizontalDirection);
  const fallbackSideCandidates = [
    ...buildHorizontalRouteCandidates(start, end, expandedObstacles, oppositeDirection(horizontalDirection)),
    ...buildVerticalRouteCandidates(start, end, expandedObstacles, oppositeDirection(verticalDirection)),
  ];
  const candidates = [
    ...dominantAxisCandidates,
    ...alternateAxisCandidates,
    ...fallbackSideCandidates,
  ];
  const legalCandidates = candidates
    .map(compactPoints)
    .filter(
      (candidate) =>
        !routeIntersectsObstacles(candidate, expandedObstacles) &&
        !routeIntersectsEndpointInteriors(candidate, [start, end]),
    );

  if (legalCandidates.length === 0) {
    throw new Error('No orthogonal route avoids Context Frames and Annotation Cards.');
  }

  legalCandidates.sort((first, second) => scoreRoute(first) - scoreRoute(second));
  return legalCandidates[0];
}

function buildHorizontalRouteCandidates(start: Rect, end: Rect, obstacles: Rect[], direction: RouteDirection): Point[][] {
  const startCenter = centerOf(start);
  const endCenter = centerOf(end);
  const startPoint = {
    x: direction > 0 ? start.x + start.width : start.x,
    y: startCenter.y,
  };
  const endPoint = {
    x: direction > 0 ? end.x : end.x + end.width,
    y: endCenter.y,
  };
  const startLead = {
    x: startPoint.x + direction * CONNECTOR_ENDPOINT_GAP,
    y: startPoint.y,
  };
  const endLead = {
    x: endPoint.x - direction * CONNECTOR_ENDPOINT_GAP,
    y: endPoint.y,
  };
  const middleX = startLead.x + (endLead.x - startLead.x) / 2;
  const directRoute = [startPoint, startLead, { x: middleX, y: startLead.y }, { x: middleX, y: endLead.y }, endLead, endPoint];
  const laneValues = getHorizontalLaneValues(start, end, startPoint.y, endPoint.y, obstacles);
  const laneRoutes = laneValues.map((laneY) => [
    startPoint,
    startLead,
    { x: startLead.x, y: laneY },
    { x: endLead.x, y: laneY },
    endLead,
    endPoint,
  ]);
  return [directRoute, ...laneRoutes];
}

function buildVerticalRouteCandidates(start: Rect, end: Rect, obstacles: Rect[], direction: RouteDirection): Point[][] {
  const startCenter = centerOf(start);
  const endCenter = centerOf(end);
  const startPoint = {
    x: startCenter.x,
    y: direction > 0 ? start.y + start.height : start.y,
  };
  const endPoint = {
    x: endCenter.x,
    y: direction > 0 ? end.y : end.y + end.height,
  };
  const startLead = {
    x: startPoint.x,
    y: startPoint.y + direction * CONNECTOR_ENDPOINT_GAP,
  };
  const endLead = {
    x: endPoint.x,
    y: endPoint.y - direction * CONNECTOR_ENDPOINT_GAP,
  };
  const middleY = startLead.y + (endLead.y - startLead.y) / 2;
  const directRoute = [startPoint, startLead, { x: startLead.x, y: middleY }, { x: endLead.x, y: middleY }, endLead, endPoint];
  const laneValues = getVerticalLaneValues(start, end, startPoint.x, endPoint.x, obstacles);
  const laneRoutes = laneValues.map((laneX) => [
    startPoint,
    startLead,
    { x: laneX, y: startLead.y },
    { x: laneX, y: endLead.y },
    endLead,
    endPoint,
  ]);
  return [directRoute, ...laneRoutes];
}

function oppositeDirection(direction: RouteDirection): RouteDirection {
  return direction > 0 ? -1 : 1;
}

function getHorizontalLaneValues(start: Rect, end: Rect, startY: number, endY: number, obstacles: Rect[]): number[] {
  const relevantBounds = unionRects([start, end, ...obstacles]);
  return uniqueNumbers([
    startY,
    endY,
    start.y - CONNECTOR_ROUTE_PADDING,
    start.y + start.height + CONNECTOR_ROUTE_PADDING,
    end.y - CONNECTOR_ROUTE_PADDING,
    end.y + end.height + CONNECTOR_ROUTE_PADDING,
    relevantBounds.y - CONNECTOR_ROUTE_PADDING,
    relevantBounds.y + relevantBounds.height + CONNECTOR_ROUTE_PADDING,
    ...obstacles.flatMap((obstacle) => [
      obstacle.y - CONNECTOR_ROUTE_PADDING,
      obstacle.y + obstacle.height + CONNECTOR_ROUTE_PADDING,
    ]),
  ]);
}

function getVerticalLaneValues(start: Rect, end: Rect, startX: number, endX: number, obstacles: Rect[]): number[] {
  const relevantBounds = unionRects([start, end, ...obstacles]);
  return uniqueNumbers([
    startX,
    endX,
    start.x - CONNECTOR_ROUTE_PADDING,
    start.x + start.width + CONNECTOR_ROUTE_PADDING,
    end.x - CONNECTOR_ROUTE_PADDING,
    end.x + end.width + CONNECTOR_ROUTE_PADDING,
    relevantBounds.x - CONNECTOR_ROUTE_PADDING,
    relevantBounds.x + relevantBounds.width + CONNECTOR_ROUTE_PADDING,
    ...obstacles.flatMap((obstacle) => [
      obstacle.x - CONNECTOR_ROUTE_PADDING,
      obstacle.x + obstacle.width + CONNECTOR_ROUTE_PADDING,
    ]),
  ]);
}

function routeIntersectsObstacles(points: Point[], obstacles: Rect[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (obstacles.some((obstacle) => segmentIntersectsRect(points[index], points[index + 1], obstacle))) {
      return true;
    }
  }
  return false;
}

function routeIntersectsEndpointInteriors(points: Point[], endpoints: Rect[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (endpoints.some((endpoint) => segmentIntersectsRectInterior(points[index], points[index + 1], endpoint))) {
      return true;
    }
  }
  return false;
}

function segmentIntersectsRect(start: Point, end: Point, rect: Rect): boolean {
  if (Math.abs(start.y - end.y) < ROUTE_EPSILON) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return start.y >= rect.y && start.y <= rect.y + rect.height && maxX >= rect.x && minX <= rect.x + rect.width;
  }

  if (Math.abs(start.x - end.x) < ROUTE_EPSILON) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return start.x >= rect.x && start.x <= rect.x + rect.width && maxY >= rect.y && minY <= rect.y + rect.height;
  }

  return true;
}

function segmentIntersectsRectInterior(start: Point, end: Point, rect: Rect): boolean {
  if (Math.abs(start.y - end.y) < ROUTE_EPSILON) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return (
      start.y > rect.y + ROUTE_EPSILON &&
      start.y < rect.y + rect.height - ROUTE_EPSILON &&
      maxX > rect.x + ROUTE_EPSILON &&
      minX < rect.x + rect.width - ROUTE_EPSILON
    );
  }

  if (Math.abs(start.x - end.x) < ROUTE_EPSILON) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return (
      start.x > rect.x + ROUTE_EPSILON &&
      start.x < rect.x + rect.width - ROUTE_EPSILON &&
      maxY > rect.y + ROUTE_EPSILON &&
      minY < rect.y + rect.height - ROUTE_EPSILON
    );
  }

  return true;
}

function scoreRoute(points: Point[]): number {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += distance(points[index], points[index + 1]);
  }
  return length + Math.max(0, points.length - 2) * 8;
}

export function collectConnectorObstacles(startNode: SceneNode, endNode: SceneNode, runtime: ConnectRuntime): Rect[] {
  const obstacles: Rect[] = [];
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

    if (kind === VISUAL_NODE_KINDS.annotationCard && !nodeContainsEndpoint && node.absoluteBoundingBox !== null) {
      generatedAncestor = true;
      coveringObstacles = appendUncoveredObstacle(obstacles, coveringObstacles, node.absoluteBoundingBox);
    } else if (kind !== '' || generatedAncestor) {
      generatedAncestor = true;
    } else if (node.type === 'FRAME' && !nodeContainsEndpoint && node.absoluteBoundingBox !== null) {
      wholeFrameObstacle = true;
      coveringObstacles = appendUncoveredObstacle(obstacles, coveringObstacles, node.absoluteBoundingBox);
    }

    if (generatedAncestor || wholeFrameObstacle || !('children' in node)) {
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

function appendUncoveredObstacle(obstacles: Rect[], coveringObstacles: Rect[], candidate: Rect): Rect[] {
  // Descendant obstacles fully inside an ancestor cannot add routing constraints.
  if (isCoveredByObstacle(candidate, coveringObstacles)) {
    return coveringObstacles;
  }

  obstacles.push(candidate);
  return [...coveringObstacles, candidate];
}

function isCoveredByObstacle(candidate: Rect, coveringObstacles: Rect[]): boolean {
  return coveringObstacles.some((obstacle) => rectContainsRect(obstacle, candidate));
}

function pointsToRects(points: Point[]): Rect[] {
  return points.map((point) => ({
    x: point.x,
    y: point.y,
    width: 0,
    height: 0,
  }));
}

function expandRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function compactPoints(points: Point[]): Point[] {
  const compacted: Point[] = [];
  points.forEach((point) => {
    const previous = compacted[compacted.length - 1];
    if (previous === undefined || distance(previous, point) >= 0.001) {
      compacted.push(point);
    }
  });
  return compacted;
}

function centerOf(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function distance(start: Point, end: Point): number {
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

function normalize(vector: Point): Point {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length < 0.001) {
    return { x: 1, y: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function getLongestSegmentMidpoint(points: Point[]): Point {
  let bestStart = points[0];
  let bestEnd = points[points.length - 1];
  let bestLength = -1;

  for (let index = 0; index < points.length - 1; index += 1) {
    const length = distance(points[index], points[index + 1]);
    if (length > bestLength) {
      bestStart = points[index];
      bestEnd = points[index + 1];
      bestLength = length;
    }
  }

  return {
    x: bestStart.x + (bestEnd.x - bestStart.x) / 2,
    y: bestStart.y + (bestEnd.y - bestStart.y) / 2,
  };
}

function toSvgPathData(points: Point[], bounds: Rect): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command} ${formatNumber(point.x - bounds.x)} ${formatNumber(point.y - bounds.y)}`;
    })
    .join(' ');
}

function toSvgPolygonData(points: Point[], bounds: Rect): string {
  return `${toSvgPathData(points, bounds)} Z`;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function hexToSolidPaint(hex: string): SolidPaint {
  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return {
    type: 'SOLID',
    color: {
      r: red,
      g: green,
      b: blue,
    },
  };
}

function uniqueNumbers(values: number[]): number[] {
  const seen = new Set<number>();
  const unique: number[] = [];
  values.forEach((value) => {
    const rounded = Number(value.toFixed(2));
    if (!seen.has(rounded)) {
      seen.add(rounded);
      unique.push(rounded);
    }
  });
  return unique;
}

function getAncestorIds(node: BaseNode): Set<string> {
  const ids = new Set<string>();
  let current = node.parent;
  while (current !== null && current.type !== 'PAGE') {
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
  return figma.currentPage.selection.filter((node) => !node.removed && isConnectorEndpoint(node, runtime));
}

function isConnectorEndpoint(node: SceneNode, runtime: ConnectRuntime): boolean {
  return (
    isFlowEndpointEligibleVisualKind(node.getSharedPluginData(runtime.namespace, SHARED_PLUGIN_DATA.keys.kind)) &&
    !runtime.hasGeneratedAncestor(node)
  );
}

export function resetObservedEndpointSelection(runtime: ConnectRuntime): void {
  connectorEndpointWindowNodes = [];
  observedSelectedEndpointIds = new Set(getSelectedConnectorEndpointIds(runtime));
}
