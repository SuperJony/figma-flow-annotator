const NAMESPACE = 'figma_flow_annotator';
const ANNOTATIONS_CONTAINER_NAME = 'FFA Annotations';
const CONNECTORS_CONTAINER_NAME = 'FFA Connectors';
const FONT: FontName = { family: 'Inter', style: 'Regular' };
const CARD_WIDTH = 280;
const BADGE_SIZE = 28;
const CONNECTOR_THICKNESS = 4;
const CARD_OFFSET_Y = 40;
const CARD_GAP = 16;
const CONNECTOR_ROUTE_PADDING = 24;
const CONNECTOR_ENDPOINT_GAP = 32;
const CONNECTOR_ARROW_LENGTH = 18;
const CONNECTOR_ARROW_WIDTH = 16;
const CONNECTOR_COLOR = '#1F3A5A';
const ROUTE_EPSILON = 0.001;

type PluginMessage =
  | { type: 'create-annotation'; body: string }
  | { type: 'create-connector'; flowAction: string }
  | { type: 'close' }
  | { type: 'request-selection-state' };

type StatusTone = 'success' | 'error';

interface Point {
  x: number;
  y: number;
}

type RouteDirection = -1 | 1;

interface AnnotationCreationResult {
  annotationNumber: number;
  badgeCount: number;
  nodes: SceneNode[];
}

interface EndpointRecord {
  nodeId: string;
  contextFrameId: string;
}

interface AnnotationRecord {
  schemaVersion: 1;
  id: string;
  annotationNumber: number;
  body: string;
  contextFrameId: string;
  subjectNodeIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface BadgeRefRecord {
  schemaVersion: 1;
  annotationId: string;
  annotationNumber: number;
  subjectNodeId: string;
  contextFrameId: string;
}

interface ConnectorRecord {
  schemaVersion: 1;
  id: string;
  start: EndpointRecord;
  end: EndpointRecord;
  ownerContextFrameId: string;
  flowAction: string | null;
  routeCache: {
    schemaVersion: 1;
    points: Point[];
  };
  createdAt: string;
  updatedAt: string;
}

interface ContextRecord {
  schemaVersion: 1;
  contextFrameId: string;
  nextAnnotationNumber: number;
}

type ContextDataNode = FrameNode;

let loadedFonts = false;

figma.showUI(__html__, {
  title: 'Flow Annotator',
  width: 360,
  height: 520,
  themeColors: true,
});

postSelectionState();
figma.on('selectionchange', postSelectionState);

figma.ui.onmessage = (message: PluginMessage) => {
  void handleMessage(message);
};

async function handleMessage(message: PluginMessage): Promise<void> {
  if (message.type === 'close') {
    figma.closePlugin();
    return;
  }

  if (message.type === 'request-selection-state') {
    postSelectionState();
    return;
  }

  try {
    await ensureFont();

    if (message.type === 'create-annotation') {
      const created = createAnnotations(message.body);
      selectAndZoom(created.nodes);
      postStatus(
        'success',
        `Created annotation #${created.annotationNumber} with ${created.badgeCount} badge(s).`,
      );
      return;
    }

    const created = createFlowConnector(message.flowAction);
    selectAndZoom([created]);
    postStatus('success', 'Created one flow connector.');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown plugin error.';
    figma.notify(errorMessage);
    postStatus('error', errorMessage);
  } finally {
    postSelectionState();
  }
}

function createAnnotations(bodyValue: string): AnnotationCreationResult {
  const body = bodyValue.trim();
  if (body.length === 0) {
    throw new Error('Annotation Body is required.');
  }

  const subjects = figma.currentPage.selection.filter((node) => !hasGeneratedAncestor(node));
  if (subjects.length === 0) {
    throw new Error('Select one or more non-generated Subject Nodes.');
  }

  const contextFrameId = findAnnotationContextFrameId(subjects);
  const subjectBounds = subjects.map(getVisibleBounds);
  const annotationBounds = unionRects(subjectBounds);
  const annotationNumber = allocateNextAnnotationNumber(contextFrameId);
  const container = ensureContainer(ANNOTATIONS_CONTAINER_NAME);
  const now = new Date().toISOString();
  const annotationId = createId('annotation');
  const record: AnnotationRecord = {
    schemaVersion: 1,
    id: annotationId,
    annotationNumber,
    body,
    contextFrameId,
    subjectNodeIds: subjects.map((subject) => subject.id),
    createdAt: now,
    updatedAt: now,
  };

  const card = createAnnotationCard(container, subjects, annotationBounds, record);
  card.setSharedPluginData(NAMESPACE, 'kind', 'annotation-card');
  card.setSharedPluginData(NAMESPACE, 'annotation', JSON.stringify(record));

  const badges = subjects.map((subject, index) => {
    const badgeRef: BadgeRefRecord = {
      schemaVersion: 1,
      annotationId,
      annotationNumber,
      subjectNodeId: subject.id,
      contextFrameId,
    };
    const badge = createAnnotationBadge(container, subjectBounds[index], subject, record);
    badge.setSharedPluginData(NAMESPACE, 'kind', 'annotation-badge');
    badge.setSharedPluginData(NAMESPACE, 'badgeRef', JSON.stringify(badgeRef));
    appendSharedReference(subject, 'annotationRefs', 'annotationIds', annotationId);
    return badge;
  });

  bringBadgesToFront(container);
  ensureLayerOrder();
  return {
    annotationNumber,
    badgeCount: badges.length,
    nodes: [card, ...badges],
  };
}

function createFlowConnector(flowActionValue: string): GroupNode {
  const selected = figma.currentPage.selection;
  if (selected.length !== 2) {
    throw new Error('Create Flow Connector requires exactly two selected Flow Endpoints.');
  }

  const [startNode, endNode] = selected;
  if (hasGeneratedAncestor(startNode) || hasGeneratedAncestor(endNode)) {
    throw new Error('Flow Endpoints must be non-generated Figma nodes.');
  }

  const startBounds = getVisibleBounds(startNode);
  const endBounds = getVisibleBounds(endNode);
  const startContextFrameId = findContextFrameId(startNode);
  const endContextFrameId = findContextFrameId(endNode);
  const routePoints = buildOrthogonalRoute(startBounds, endBounds, collectConnectorObstacles(startNode, endNode));
  const connectorId = createId('connector');
  const flowAction = flowActionValue.trim();
  const now = new Date().toISOString();
  const container = ensureContainer(CONNECTORS_CONTAINER_NAME);

  const visualNodes = createConnectorVisualNodes(routePoints, flowAction);
  const connectorRoot = figma.group(visualNodes, container);
  connectorRoot.name = `FFA Connector ${readableName(startNode.name)} -> ${readableName(endNode.name)}`;

  const record: ConnectorRecord = {
    schemaVersion: 1,
    id: connectorId,
    start: {
      nodeId: startNode.id,
      contextFrameId: startContextFrameId,
    },
    end: {
      nodeId: endNode.id,
      contextFrameId: endContextFrameId,
    },
    ownerContextFrameId: startContextFrameId,
    flowAction: flowAction.length > 0 ? flowAction : null,
    routeCache: {
      schemaVersion: 1,
      points: routePoints,
    },
    createdAt: now,
    updatedAt: now,
  };

  connectorRoot.setSharedPluginData(NAMESPACE, 'kind', 'flow-connector');
  connectorRoot.setSharedPluginData(NAMESPACE, 'connector', JSON.stringify(record));
  appendSharedReference(startNode, 'connectorRefs', 'connectorIds', connectorId);
  appendSharedReference(endNode, 'connectorRefs', 'connectorIds', connectorId);

  ensureLayerOrder();
  return connectorRoot;
}

function createAnnotationCard(
  container: FrameNode,
  subjects: SceneNode[],
  bounds: Rect,
  record: AnnotationRecord,
): FrameNode {
  const card = figma.createFrame();
  card.name = `FFA Annotation Card #${record.annotationNumber}`;
  card.fills = [solidPaint(1, 1, 1)];
  card.strokes = [solidPaint(0.21, 0.35, 0.55)];
  card.strokeWeight = 1;
  card.cornerRadius = 8;
  card.clipsContent = false;
  card.resize(CARD_WIDTH, 128);
  container.appendChild(card);

  const title = createText(`Annotation Number ${record.annotationNumber}`, `Annotation #${record.annotationNumber}`, 13, solidPaint(0.07, 0.12, 0.2), CARD_WIDTH - 32);
  card.appendChild(title);
  title.x = 16;
  title.y = 14;

  const subjectLabel = createText('Subject Nodes', `Subjects: ${readableSubjectNames(subjects)}`, 11, solidPaint(0.34, 0.4, 0.49), CARD_WIDTH - 32);
  card.appendChild(subjectLabel);
  subjectLabel.x = 16;
  subjectLabel.y = 38;

  const body = createText('Annotation Body', record.body, 12, solidPaint(0.1, 0.1, 0.11), CARD_WIDTH - 32);
  card.appendChild(body);
  body.x = 16;
  body.y = 64;
  card.resize(CARD_WIDTH, Math.max(112, body.y + body.height + 18));

  const position = findOpenCardPosition(container, card, {
    x: bounds.x,
    y: bounds.y + bounds.height + CARD_OFFSET_Y,
  });
  card.x = position.x;
  card.y = position.y;

  return card;
}

function createAnnotationBadge(
  container: FrameNode,
  bounds: Rect,
  subject: SceneNode,
  record: AnnotationRecord,
): FrameNode {
  const existingRefs = readReferenceIds(subject, 'annotationRefs', 'annotationIds');
  const badge = figma.createFrame();
  badge.name = `FFA Annotation Badge #${record.annotationNumber}`;
  badge.fills = [solidPaint(0.88, 0.22, 0.2)];
  badge.strokes = [solidPaint(1, 1, 1)];
  badge.strokeWeight = 2;
  badge.cornerRadius = BADGE_SIZE / 2;
  badge.clipsContent = false;
  badge.resize(BADGE_SIZE, BADGE_SIZE);
  container.appendChild(badge);
  badge.x = bounds.x + bounds.width - BADGE_SIZE / 2 + existingRefs.length * (BADGE_SIZE + 4);
  badge.y = bounds.y - BADGE_SIZE / 2;

  const number = createText('Annotation Badge Number', String(record.annotationNumber), 12, solidPaint(1, 1, 1), BADGE_SIZE);
  number.textAutoResize = 'WIDTH_AND_HEIGHT';
  badge.appendChild(number);
  number.x = (BADGE_SIZE - number.width) / 2;
  number.y = (BADGE_SIZE - number.height) / 2;

  return badge;
}

function createConnectorVisualNodes(points: Point[], flowAction: string): SceneNode[] {
  const nodes: SceneNode[] = [createConnectorRouteSvg(points)];

  if (flowAction.length > 0) {
    nodes.push(createFlowActionLabel(points, flowAction));
  }

  return nodes;
}

function createConnectorRouteSvg(points: Point[]): FrameNode {
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
  const route = figma.createNodeFromSvg(svg);
  route.name = 'FFA Connector Route';
  route.x = bounds.x;
  route.y = bounds.y;
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

function createFlowActionLabel(points: Point[], flowAction: string): FrameNode {
  const label = figma.createFrame();
  const midpoint = getLongestSegmentMidpoint(points);
  const text = createText('Flow Action', flowAction, 11, solidPaint(0.09, 0.14, 0.22), 160);
  text.textAutoResize = 'WIDTH_AND_HEIGHT';

  label.name = 'FFA Flow Action Label';
  label.fills = [solidPaint(0.98, 0.95, 0.78)];
  label.strokes = [solidPaint(0.72, 0.54, 0.13)];
  label.strokeWeight = 1;
  label.cornerRadius = 6;
  label.clipsContent = false;
  label.resize(Math.max(56, text.width + 20), Math.max(28, text.height + 12));
  label.x = midpoint.x - label.width / 2;
  label.y = midpoint.y - label.height / 2;

  label.appendChild(text);
  text.x = 10;
  text.y = 6;

  return label;
}

function buildOrthogonalRoute(start: Rect, end: Rect, obstacles: Rect[]): Point[] {
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

function collectConnectorObstacles(startNode: SceneNode, endNode: SceneNode): Rect[] {
  const obstacles: Rect[] = [];
  walkPageNodes((node) => {
    if (!isConnectorObstacle(node, startNode, endNode) || node.absoluteBoundingBox === null) {
      return;
    }
    obstacles.push(node.absoluteBoundingBox);
  });
  return obstacles;
}

function isConnectorObstacle(node: SceneNode, startNode: SceneNode, endNode: SceneNode): boolean {
  if (node === startNode || node === endNode || isAncestor(node, startNode) || isAncestor(node, endNode)) {
    return false;
  }

  const kind = node.getSharedPluginData(NAMESPACE, 'kind');
  if (kind === 'annotation-card') {
    return true;
  }

  if (kind !== '' || hasGeneratedAncestor(node)) {
    return false;
  }

  return node.type === 'FRAME';
}

function findOpenCardPosition(container: FrameNode, card: FrameNode, basePosition: Point): Point {
  let candidate = {
    x: basePosition.x,
    y: basePosition.y,
  };
  const existingCards = container.children.filter(
    (child): child is FrameNode =>
      child !== card &&
      child.type === 'FRAME' &&
      child.getSharedPluginData(NAMESPACE, 'kind') === 'annotation-card',
  );

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidateRect = {
      x: candidate.x,
      y: candidate.y,
      width: card.width,
      height: card.height,
    };
    const conflict = existingCards.find((existingCard) => rectsOverlap(candidateRect, localRect(existingCard)));
    if (conflict === undefined) {
      return candidate;
    }
    candidate = {
      x: candidate.x,
      y: localRect(conflict).y + localRect(conflict).height + CARD_GAP,
    };
  }

  return candidate;
}

function findAnnotationContextFrameId(subjects: SceneNode[]): string {
  const commonFrame = findNearestCommonFrame(subjects);
  if (commonFrame === null) {
    throw new Error('Selected Subject Nodes must share one Context Frame.');
  }
  return commonFrame.id;
}

function findNearestCommonFrame(subjects: SceneNode[]): FrameNode | null {
  const chains = subjects.map(frameAncestorChain);
  const firstChain = chains[0] ?? [];
  let commonFrame: FrameNode | null = null;

  for (let index = 0; index < firstChain.length; index += 1) {
    const candidate = firstChain[index];
    if (chains.every((chain) => chain[index]?.id === candidate.id)) {
      commonFrame = candidate;
      continue;
    }
    break;
  }

  return commonFrame;
}

function frameAncestorChain(node: SceneNode): FrameNode[] {
  const chain: FrameNode[] = [];
  let current: BaseNode | null = node;
  while (current !== null && current.type !== 'PAGE') {
    if (current.type === 'FRAME') {
      chain.unshift(current);
    }
    current = current.parent;
  }
  return chain;
}

function readableSubjectNames(subjects: SceneNode[]): string {
  const names = subjects.map((subject) => readableName(subject.name));
  if (names.length <= 3) {
    return names.join(', ');
  }
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

function ensureContainer(name: string): FrameNode {
  const existing = findContainer(name);
  if (existing !== null) {
    return existing;
  }

  const container = figma.createFrame();
  container.name = name;
  container.fills = [];
  container.strokes = [];
  container.clipsContent = false;
  container.resize(1, 1);
  container.x = 0;
  container.y = 0;
  container.setSharedPluginData(NAMESPACE, 'kind', 'container');
  ensureLayerOrder();
  return container;
}

function findContainer(name: string): FrameNode | null {
  for (const child of figma.currentPage.children) {
    if (
      child.type === 'FRAME' &&
      child.name === name &&
      child.getSharedPluginData(NAMESPACE, 'kind') === 'container'
    ) {
      return child;
    }
  }
  return null;
}

function ensureLayerOrder(): void {
  const annotations = findContainer(ANNOTATIONS_CONTAINER_NAME);
  const connectors = findContainer(CONNECTORS_CONTAINER_NAME);

  if (annotations !== null) {
    figma.currentPage.appendChild(annotations);
  }

  if (annotations !== null && connectors !== null) {
    const annotationIndex = figma.currentPage.children.indexOf(annotations);
    const connectorIndex = figma.currentPage.children.indexOf(connectors);
    if (connectorIndex > annotationIndex) {
      figma.currentPage.insertChild(annotationIndex, connectors);
    }
  }
}

function bringBadgesToFront(container: FrameNode): void {
  const badges = container.children.filter(
    (child) => child.getSharedPluginData(NAMESPACE, 'kind') === 'annotation-badge',
  );
  badges.forEach((badge) => {
    container.appendChild(badge);
  });
}

function allocateNextAnnotationNumber(contextFrameId: string): number {
  const contextNode = findContextDataNode(contextFrameId);
  const contextRecord = readContextRecord(contextNode, contextFrameId);
  const seededNextAnnotationNumber = getSeededNextAnnotationNumber(contextFrameId);
  const annotationNumber = Math.max(contextRecord?.nextAnnotationNumber ?? 1, seededNextAnnotationNumber);
  writeContextRecord(contextNode, contextFrameId, annotationNumber + 1);
  return annotationNumber;
}

function findContextDataNode(contextFrameId: string): ContextDataNode {
  let contextNode: FrameNode | null = null;
  walkPageNodes((node) => {
    if (node.type === 'FRAME' && node.id === contextFrameId) {
      contextNode = node;
    }
  });

  if (contextNode === null) {
    throw new Error('Context Frame not found for Annotation Number allocation.');
  }

  return contextNode;
}

function readContextRecord(contextNode: ContextDataNode, contextFrameId: string): ContextRecord | null {
  const parsed = parseJson(contextNode.getSharedPluginData(NAMESPACE, 'context'));
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    parsed.contextFrameId !== contextFrameId ||
    !isPositiveInteger(parsed.nextAnnotationNumber)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    contextFrameId,
    nextAnnotationNumber: parsed.nextAnnotationNumber,
  };
}

function writeContextRecord(contextNode: ContextDataNode, contextFrameId: string, nextAnnotationNumber: number): void {
  const record: ContextRecord = {
    schemaVersion: 1,
    contextFrameId,
    nextAnnotationNumber,
  };
  contextNode.setSharedPluginData(NAMESPACE, 'context', JSON.stringify(record));
}

function getSeededNextAnnotationNumber(contextFrameId: string): number {
  let maxNumber = 0;
  walkPageNodes((node) => {
    if (node.getSharedPluginData(NAMESPACE, 'kind') !== 'annotation-card') {
      return;
    }

    const annotation = parseJson(node.getSharedPluginData(NAMESPACE, 'annotation'));
    if (
      isRecord(annotation) &&
      annotation.contextFrameId === contextFrameId &&
      isPositiveInteger(annotation.annotationNumber)
    ) {
      maxNumber = Math.max(maxNumber, annotation.annotationNumber);
    }
  });
  return maxNumber + 1;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function walkPageNodes(visit: (node: SceneNode) => void): void {
  const pending: SceneNode[] = [...figma.currentPage.children];

  while (pending.length > 0) {
    const node = pending.shift();
    if (node === undefined) {
      continue;
    }

    visit(node);
    if ('children' in node) {
      pending.push(...node.children);
    }
  }
}

function appendSharedReference(
  node: SceneNode,
  dataKey: 'annotationRefs' | 'connectorRefs',
  listKey: 'annotationIds' | 'connectorIds',
  id: string,
): void {
  const existingIds = readReferenceIds(node, dataKey, listKey);
  const nextIds = existingIds.includes(id) ? existingIds : [...existingIds, id];
  node.setSharedPluginData(
    NAMESPACE,
    dataKey,
    JSON.stringify({
      schemaVersion: 1,
      [listKey]: nextIds,
    }),
  );
}

function readReferenceIds(
  node: SceneNode,
  dataKey: 'annotationRefs' | 'connectorRefs',
  listKey: 'annotationIds' | 'connectorIds',
): string[] {
  const parsed = parseJson(node.getSharedPluginData(NAMESPACE, dataKey));
  if (!isRecord(parsed) || !Array.isArray(parsed[listKey])) {
    return [];
  }
  return parsed[listKey].filter((value): value is string => typeof value === 'string');
}

function createText(
  name: string,
  characters: string,
  fontSize: number,
  fills: SolidPaint,
  width: number,
): TextNode {
  const text = figma.createText();
  text.name = name;
  text.fontName = FONT;
  text.fontSize = fontSize;
  text.fills = [fills];
  text.textAutoResize = 'HEIGHT';
  text.resize(width, 1);
  text.characters = characters;
  return text;
}

async function ensureFont(): Promise<void> {
  if (loadedFonts) {
    return;
  }
  await figma.loadFontAsync(FONT);
  loadedFonts = true;
}

function getVisibleBounds(node: SceneNode): Rect {
  if (node.absoluteBoundingBox === null) {
    throw new Error(`${readableName(node.name)} has no visible bounds.`);
  }
  return node.absoluteBoundingBox;
}

function centerOf(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
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

function localRect(node: SceneNode): Rect {
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
}

function rectsOverlap(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
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

function isAncestor(candidate: BaseNode, node: BaseNode): boolean {
  let current = node.parent;
  while (current !== null) {
    if (current === candidate) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function findContextFrameId(node: SceneNode): string {
  let current: BaseNode | null = node;
  while (current !== null) {
    if (current.type === 'FRAME') {
      return current.id;
    }
    current = current.parent;
  }
  return figma.currentPage.id;
}

function hasGeneratedAncestor(node: SceneNode): boolean {
  let current: BaseNode | null = node;
  while (current !== null && current.type !== 'PAGE') {
    if (current.getSharedPluginData(NAMESPACE, 'kind') !== '') {
      return true;
    }
    current = current.parent;
  }
  return false;
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

function solidPaint(r: number, g: number, b: number): SolidPaint {
  return {
    type: 'SOLID',
    color: { r, g, b },
  };
}

function createId(prefix: 'annotation' | 'connector'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readableName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 48) : 'Untitled';
}

function selectAndZoom(nodes: SceneNode[]): void {
  figma.currentPage.selection = nodes;
  figma.viewport.scrollAndZoomIntoView(nodes);
}

function postStatus(tone: StatusTone, message: string): void {
  figma.ui.postMessage({
    type: 'status',
    tone,
    message,
  });
  if (tone === 'success') {
    figma.notify(message);
  }
}

function postSelectionState(): void {
  const selected = figma.currentPage.selection;
  const eligibleCount = selected.filter((node) => !hasGeneratedAncestor(node)).length;
  figma.ui.postMessage({
    type: 'selection-state',
    totalCount: selected.length,
    eligibleCount,
  });
}
