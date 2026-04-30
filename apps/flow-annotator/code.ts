import {
  CONNECTORS_CONTAINER_NAME,
  createFlowConnector,
  getPendingConnectorEndpointNodes,
  handleSelectionChange,
  resetObservedEndpointSelection,
  type ConnectRuntime,
} from './connect';
import { type Point, unionRects } from './geometry';

const NAMESPACE = 'figma_flow_annotator';
const ANNOTATIONS_CONTAINER_NAME = 'FFA Annotations';
const FONT: FontName = { family: 'Inter', style: 'Regular' };
const CARD_WIDTH = 280;
const BADGE_SIZE = 28;
const CARD_OFFSET_Y = 40;
const CARD_GAP = 16;

type PluginMessage =
  | { type: 'create-annotation'; body: string }
  | { type: 'create-connector'; flowAction: string }
  | { type: 'close' }
  | { type: 'request-selection-state' };

type StatusTone = 'success' | 'error';

interface AnnotationCreationResult {
  annotationNumber: number;
  badgeCount: number;
  nodes: SceneNode[];
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

interface ContextRecord {
  schemaVersion: 1;
  contextFrameId: string;
  nextAnnotationNumber: number;
}

type ContextDataNode = FrameNode | PageNode;

let loadedFonts = false;

const connectRuntime: ConnectRuntime = {
  namespace: NAMESPACE,
  appendConnectorReference: (node, connectorId) => {
    appendSharedReference(node, 'connectorRefs', 'connectorIds', connectorId);
  },
  createId,
  createText,
  ensureContainer,
  ensureLayerOrder,
  findContextFrameId,
  getVisibleBounds,
  hasGeneratedAncestor,
  postSelectionState,
  readableName,
  solidPaint,
  walkPageNodes,
};

figma.showUI(__html__, {
  title: 'Flow Annotator',
  width: 360,
  height: 520,
  themeColors: true,
});

resetObservedEndpointSelection(connectRuntime);
postSelectionState();
figma.on('selectionchange', () => {
  handleSelectionChange(connectRuntime);
});

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

    const created = createFlowConnector(message.flowAction, connectRuntime);
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
    return figma.currentPage.id;
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
  if (contextFrameId === figma.currentPage.id) {
    return figma.currentPage;
  }

  let contextNode: FrameNode | null = null;
  walkPageNodes((node) => {
    if (node.type === 'FRAME' && node.id === contextFrameId) {
      contextNode = node;
    }
  });

  if (contextNode === null) {
    throw new Error('Context not found for Annotation Number allocation.');
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

  for (let index = 0; index < pending.length; index += 1) {
    const node = pending[index];
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
  resetObservedEndpointSelection(connectRuntime);
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
  const pendingConnectorEndpointCount = getPendingConnectorEndpointNodes(connectRuntime).length;
  figma.ui.postMessage({
    type: 'selection-state',
    totalCount: pendingConnectorEndpointCount,
    eligibleCount,
  });
}
