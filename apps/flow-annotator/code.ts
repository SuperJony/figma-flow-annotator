const NAMESPACE = 'figma_flow_annotator';
const ANNOTATIONS_CONTAINER_NAME = 'FFA Annotations';
const CONNECTORS_CONTAINER_NAME = 'FFA Connectors';
const FONT: FontName = { family: 'Inter', style: 'Regular' };
const CARD_WIDTH = 280;
const BADGE_SIZE = 28;
const CONNECTOR_THICKNESS = 4;

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
      selectAndZoom(created);
      postStatus('success', `Created ${created.length / 2} annotation visual set(s).`);
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

function createAnnotations(bodyValue: string): SceneNode[] {
  const body = bodyValue.trim();
  if (body.length === 0) {
    throw new Error('Annotation Body is required.');
  }

  const subjects = figma.currentPage.selection.filter((node) => !hasGeneratedAncestor(node));
  if (subjects.length === 0) {
    throw new Error('Select one or more non-generated Subject Nodes.');
  }

  const container = ensureContainer(ANNOTATIONS_CONTAINER_NAME);
  const createdNodes: SceneNode[] = [];
  let nextNumber = getNextAnnotationNumber();

  subjects.forEach((subject, index) => {
    const bounds = getVisibleBounds(subject);
    const contextFrameId = findContextFrameId(subject);
    const annotationNumber = nextNumber;
    nextNumber += 1;

    const now = new Date().toISOString();
    const annotationId = createId('annotation');
    const record: AnnotationRecord = {
      schemaVersion: 1,
      id: annotationId,
      annotationNumber,
      body,
      contextFrameId,
      subjectNodeIds: [subject.id],
      createdAt: now,
      updatedAt: now,
    };

    const card = createAnnotationCard(container, subject, bounds, index, record);
    const badge = createAnnotationBadge(container, bounds, subject, record);

    card.setSharedPluginData(NAMESPACE, 'kind', 'annotation-card');
    card.setSharedPluginData(NAMESPACE, 'annotation', JSON.stringify(record));

    const badgeRef: BadgeRefRecord = {
      schemaVersion: 1,
      annotationId,
      annotationNumber,
      subjectNodeId: subject.id,
      contextFrameId,
    };
    badge.setSharedPluginData(NAMESPACE, 'kind', 'annotation-badge');
    badge.setSharedPluginData(NAMESPACE, 'badgeRef', JSON.stringify(badgeRef));
    appendSharedReference(subject, 'annotationRefs', 'annotationIds', annotationId);

    createdNodes.push(card, badge);
  });

  bringBadgesToFront(container);
  ensureLayerOrder();
  return createdNodes;
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
  const routePoints = buildOrthogonalRoute(startBounds, endBounds);
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
  subject: SceneNode,
  bounds: Rect,
  index: number,
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
  card.x = bounds.x;
  card.y = bounds.y + bounds.height + 40 + index * 28;

  const title = createText(`Annotation Number ${record.annotationNumber}`, `Annotation #${record.annotationNumber}`, 13, solidPaint(0.07, 0.12, 0.2), CARD_WIDTH - 32);
  card.appendChild(title);
  title.x = 16;
  title.y = 14;

  const subjectLabel = createText('Subject Node', `Subject: ${readableName(subject.name)}`, 11, solidPaint(0.34, 0.4, 0.49), CARD_WIDTH - 32);
  card.appendChild(subjectLabel);
  subjectLabel.x = 16;
  subjectLabel.y = 38;

  const body = createText('Annotation Body', record.body, 12, solidPaint(0.1, 0.1, 0.11), CARD_WIDTH - 32);
  card.appendChild(body);
  body.x = 16;
  body.y = 64;
  card.resize(CARD_WIDTH, Math.max(112, body.y + body.height + 18));

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
  const nodes: SceneNode[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const segment = createSegment(points[index], points[index + 1]);
    if (segment !== null) {
      nodes.push(segment);
    }
  }

  const arrow = createArrowHead(points);
  nodes.push(arrow);

  if (flowAction.length > 0) {
    nodes.push(createFlowActionLabel(points, flowAction));
  }

  return nodes;
}

function createSegment(start: Point, end: Point): RectangleNode | null {
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < 1 && height < 1) {
    return null;
  }

  const segment = figma.createRectangle();
  segment.name = 'FFA Connector Segment';
  segment.fills = [solidPaint(0.12, 0.24, 0.38)];
  segment.cornerRadius = CONNECTOR_THICKNESS / 2;

  if (width >= height) {
    segment.resize(Math.max(width, CONNECTOR_THICKNESS), CONNECTOR_THICKNESS);
    segment.x = Math.min(start.x, end.x);
    segment.y = start.y - CONNECTOR_THICKNESS / 2;
  } else {
    segment.resize(CONNECTOR_THICKNESS, Math.max(height, CONNECTOR_THICKNESS));
    segment.x = start.x - CONNECTOR_THICKNESS / 2;
    segment.y = Math.min(start.y, end.y);
  }

  return segment;
}

function createArrowHead(points: Point[]): PolygonNode {
  const end = points[points.length - 1];
  const previous = points[points.length - 2];
  const arrow = figma.createPolygon();
  arrow.name = 'FFA Connector Direction';
  arrow.pointCount = 3;
  arrow.fills = [solidPaint(0.12, 0.24, 0.38)];
  arrow.resize(16, 16);
  arrow.x = end.x - 8;
  arrow.y = end.y - 8;
  arrow.rotation = getArrowRotation(previous, end);
  return arrow;
}

function createFlowActionLabel(points: Point[], flowAction: string): FrameNode {
  const label = figma.createFrame();
  const midpoint = points[Math.floor(points.length / 2)];
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

function buildOrthogonalRoute(start: Rect, end: Rect): Point[] {
  const startCenter = centerOf(start);
  const endCenter = centerOf(end);
  const deltaX = endCenter.x - startCenter.x;
  const deltaY = endCenter.y - startCenter.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const leavesRight = deltaX >= 0;
    const startPoint = {
      x: leavesRight ? start.x + start.width : start.x,
      y: startCenter.y,
    };
    const endPoint = {
      x: leavesRight ? end.x : end.x + end.width,
      y: endCenter.y,
    };
    const middleX = startPoint.x + (endPoint.x - startPoint.x) / 2;
    return [startPoint, { x: middleX, y: startPoint.y }, { x: middleX, y: endPoint.y }, endPoint];
  }

  const leavesDown = deltaY >= 0;
  const startPoint = {
    x: startCenter.x,
    y: leavesDown ? start.y + start.height : start.y,
  };
  const endPoint = {
    x: endCenter.x,
    y: leavesDown ? end.y : end.y + end.height,
  };
  const middleY = startPoint.y + (endPoint.y - startPoint.y) / 2;
  return [startPoint, { x: startPoint.x, y: middleY }, { x: endPoint.x, y: middleY }, endPoint];
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

function getNextAnnotationNumber(): number {
  let maxNumber = 0;
  walkPageNodes((node) => {
    if (node.getSharedPluginData(NAMESPACE, 'kind') !== 'annotation-card') {
      return;
    }

    const annotation = parseJson(node.getSharedPluginData(NAMESPACE, 'annotation'));
    if (isRecord(annotation) && typeof annotation.annotationNumber === 'number') {
      maxNumber = Math.max(maxNumber, annotation.annotationNumber);
    }
  });
  return maxNumber + 1;
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

function getArrowRotation(previous: Point, end: Point): number {
  const deltaX = end.x - previous.x;
  const deltaY = end.y - previous.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? 90 : -90;
  }

  return deltaY >= 0 ? 180 : 0;
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
