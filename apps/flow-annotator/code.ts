import {
  createFlowConnector,
  getConnectSelectionState,
  handleSelectionChange,
  resetObservedEndpointSelection,
  swapPendingConnectorEndpoints,
  type ConnectRuntime,
} from './connect';
import {
  ANNOTATIONS_CONTAINER_NAME,
  CONNECTORS_CONTAINER_NAME,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
  buildAddAnnotationSubjectsPlan,
  buildArrangeAnnotationBadgesPlan,
  buildArrangeAnnotationCardsPlan,
  buildCreateAnnotationPlan,
  mergeAnnotationReferenceIds,
  planAnnotationCardPosition,
  serializeSharedPluginDataValue,
  type AddAnnotationSubjectsPlan,
  type AnnotationValidationBadgeInput,
  type AnnotationValidationCardInput,
  type AnnotationValidationContextInput,
  type AnnotationValidationRecord,
  type AnnotationValidationSubjectInput,
  type AnnotationRecord,
  type ArrangeAnnotationBadgesPlan,
  type ArrangeAnnotationCardsPlan,
  type AppendSharedReferenceOperation,
  type BadgeRefRecord,
  type ContextRecord,
  type CreateAnnotationBadgeOperation,
  type CreateAnnotationCardOperation,
  type CreateAnnotationPlan,
  type DocumentNodeTarget,
  type MoveNodeOperation,
  type Point,
  type SetSharedPluginDataOperation,
  type ValidationReport,
  validateAnnotationBindings,
} from '../../packages/core/src/index';

const NAMESPACE = SHARED_PLUGIN_DATA.namespace;
const FONT: FontName = { family: 'Inter', style: 'Regular' };
const CARD_WIDTH = 280;
const BADGE_SIZE = 28;

type PluginMessage =
  | { type: 'create-annotation'; body: string }
  | { type: 'add-subject-nodes' }
  | { type: 'arrange-badges' }
  | { type: 'arrange-cards' }
  | { type: 'create-connector'; flowAction: string }
  | { type: 'swap-connector-endpoints' }
  | { type: 'validate-bindings' }
  | { type: 'locate-validation-issue'; issueId: string }
  | { type: 'close' }
  | { type: 'request-selection-state' };

type StatusTone = 'success' | 'error';

interface AnnotationCreationResult {
  annotationNumber: number;
  badgeCount: number;
  nodes: SceneNode[];
}

interface AddSubjectsResult {
  addedSubjectCount: number;
  annotationNumber: number;
  badgeCount: number;
  nodes: SceneNode[];
}

interface ArrangeResult {
  movedCount: number;
  nodes: SceneNode[];
}

type ContextDataNode = FrameNode | PageNode;

let loadedFonts = false;
let validationTargetsByIssueId = new Map<string, string[]>();

const connectRuntime: ConnectRuntime = {
  namespace: NAMESPACE,
  createId,
  createText,
  ensureContainer,
  ensureLayerOrder,
  findContextFrameId,
  getVisibleBounds,
  hasGeneratedAncestor,
  postSelectionState,
  solidPaint,
};

figma.showUI(__html__, {
  title: 'Flow Annotator',
  width: 360,
  height: 560,
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

    if (message.type === 'add-subject-nodes') {
      const result = addSubjectNodesToAnnotation();
      selectAndZoom(result.nodes);
      postStatus(
        'success',
        `Added ${result.addedSubjectCount} subject node(s) to annotation #${result.annotationNumber} with ${result.badgeCount} new badge(s).`,
      );
      return;
    }

    if (message.type === 'arrange-badges') {
      const result = arrangeBadgesForSelectedSubjects();
      selectAndZoom(result.nodes);
      postStatus('success', `Arranged ${result.movedCount} annotation badge(s).`);
      return;
    }

    if (message.type === 'arrange-cards') {
      const result = await arrangeAnnotationCards();
      selectAndZoom(result.nodes);
      postStatus('success', `Arranged ${result.movedCount} annotation card(s).`);
      return;
    }

    if (message.type === 'create-connector') {
      const created = createFlowConnector(message.flowAction, connectRuntime);
      selectAndZoom([created]);
      postStatus('success', 'Created or updated one flow connector.');
      return;
    }

    if (message.type === 'swap-connector-endpoints') {
      swapPendingConnectorEndpoints(connectRuntime);
      postStatus('success', 'Swapped pending Flow Connector endpoints.');
      return;
    }

    if (message.type === 'validate-bindings') {
      const report = validateCurrentPageBindings();
      postValidationReport(report);
      postStatus('success', `Validation found ${report.summary.all} issue(s).`);
      return;
    }

    if (message.type === 'locate-validation-issue') {
      await locateValidationIssue(message.issueId);
      return;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown plugin error.';
    figma.notify(errorMessage);
    postStatus('error', errorMessage);
  } finally {
    postSelectionState();
  }
}

function validateCurrentPageBindings(): ValidationReport {
  const pageNodes = collectCurrentPageNodes();
  const allNodes = [figma.currentPage, ...pageNodes];
  const annotationsContainer = findContainer(ANNOTATIONS_CONTAINER_NAME);
  const cards = annotationsContainer === null ? [] : getAnnotationValidationCards(annotationsContainer);
  const badges = annotationsContainer === null ? [] : getAnnotationValidationBadges(annotationsContainer);
  const subjects: AnnotationValidationSubjectInput[] = pageNodes.map((node) => ({
    annotationIds: readReferenceIds(node, SHARED_PLUGIN_DATA.keys.annotationRefs, 'annotationIds'),
    nodeId: node.id,
    ...(node.absoluteBoundingBox === null ? {} : { rect: node.absoluteBoundingBox }),
  }));
  const contexts: AnnotationValidationContextInput[] = allNodes.map((node) => ({
    nodeId: node.id,
    ...('absoluteBoundingBox' in node && node.absoluteBoundingBox !== null ? { rect: node.absoluteBoundingBox } : {}),
  }));
  const report = validateAnnotationBindings({
    badges,
    cards,
    contexts,
    subjects,
  });

  validationTargetsByIssueId = new Map(report.issues.map((issue) => [issue.id, issue.locationNodeIds]));
  return report;
}

async function locateValidationIssue(issueId: string): Promise<void> {
  const nodeIds = validationTargetsByIssueId.get(issueId);
  if (nodeIds === undefined) {
    throw new Error('Validation issue is no longer available. Run Validate again.');
  }

  const nodes = await getExistingSceneNodes(nodeIds);
  if (nodes.length === 0) {
    throw new Error('No live Figma nodes are available for this validation issue.');
  }

  selectAndZoom(nodes);
  postStatus('success', `Located ${nodes.length} validation object(s).`);
}

function createAnnotations(bodyValue: string): AnnotationCreationResult {
  const subjects = figma.currentPage.selection.filter((node) => !hasGeneratedAncestor(node));
  const contextNode = findAnnotationContextNode(subjects);
  const contextFrameId = contextNode.id;
  const annotationNumber = getNextAnnotationNumber(contextNode);
  const now = new Date().toISOString();
  const plan = buildCreateAnnotationPlan({
    annotationId: createId('annotation'),
    annotationNumber,
    body: bodyValue,
    contextFrameId,
    now,
    subjects: subjects.map((subject) => ({
      bounds: getVisibleBounds(subject),
      existingAnnotationRefCount: readReferenceIds(subject, 'annotationRefs', 'annotationIds').length,
      id: subject.id,
      name: subject.name,
    })),
  });
  const applied = applyAnnotationPlan(plan, new Map([
    [contextNode.id, contextNode],
    ...subjects.map((subject): [string, BaseNode] => [subject.id, subject]),
  ]));

  ensureLayerOrder();
  return {
    annotationNumber: plan.annotationNumber,
    badgeCount: plan.badgeCount,
    nodes: applied.nodes,
  };
}

function addSubjectNodesToAnnotation(): AddSubjectsResult {
  const annotationCard = getSelectedAnnotationCard();
  const annotation = readAnnotationRecord(annotationCard);
  const subjects = figma.currentPage.selection.filter((node) => node !== annotationCard && !hasGeneratedAncestor(node));
  const annotationsContainer = ensureContainer(ANNOTATIONS_CONTAINER_NAME);
  const now = new Date().toISOString();
  const plan = buildAddAnnotationSubjectsPlan({
    annotation,
    annotationCardNodeId: annotationCard.id,
    existingBadgeSubjectNodeIds: getBadgeSubjectNodeIds(annotationsContainer, annotation.id),
    now,
    subjects: subjects.map((subject) => ({
      bounds: getVisibleBounds(subject),
      existingAnnotationRefCount: readReferenceIds(subject, 'annotationRefs', 'annotationIds').length,
      id: subject.id,
      name: subject.name,
    })),
  });
  const existingNodes = new Map<string, BaseNode>([
    [annotationCard.id, annotationCard],
    ...subjects.map((subject): [string, BaseNode] => [subject.id, subject]),
  ]);
  const applied = applyAnnotationPlan(plan, existingNodes);

  ensureLayerOrder();
  return {
    addedSubjectCount: plan.addedSubjectNodeIds.length,
    annotationNumber: plan.annotationNumber,
    badgeCount: plan.badgeCount,
    nodes: applied.nodes.length > 0 ? applied.nodes : [annotationCard],
  };
}

function arrangeBadgesForSelectedSubjects(): ArrangeResult {
  const subjects = figma.currentPage.selection.filter((node) => !hasGeneratedAncestor(node));
  const annotationsContainer = findContainer(ANNOTATIONS_CONTAINER_NAME);
  if (annotationsContainer === null) {
    throw new Error('No Annotation Badges found to arrange.');
  }

  const badgeRecords = getAnnotationBadgeRecords(annotationsContainer);
  const plan = buildArrangeAnnotationBadgesPlan({
    subjects: subjects.map((subject) => ({
      badges: badgeRecords.filter((badge) => badge.record.subjectNodeId === subject.id).map((badge) => ({
        annotationNumber: badge.record.annotationNumber,
        nodeId: badge.node.id,
      })),
      bounds: getVisibleBounds(subject),
      id: subject.id,
    })).filter((subject) => subject.badges.length > 0),
  });
  const existingNodes = new Map<string, BaseNode>(badgeRecords.map((badge) => [badge.node.id, badge.node]));
  const applied = applyAnnotationPlan(plan, existingNodes);
  bringBadgesToFront(annotationsContainer);
  return {
    movedCount: plan.movedBadgeNodeIds.length,
    nodes: applied.nodes,
  };
}

async function arrangeAnnotationCards(): Promise<ArrangeResult> {
  const annotationsContainer = findContainer(ANNOTATIONS_CONTAINER_NAME);
  if (annotationsContainer === null) {
    throw new Error('No Annotation Cards found to arrange.');
  }

  const cardRecords = getAnnotationCardRecords(annotationsContainer);
  if (cardRecords.length === 0) {
    throw new Error('No Annotation Cards found to arrange.');
  }

  const existingNodes = new Map<string, BaseNode>(cardRecords.map((card) => [card.node.id, card.node]));
  const movedNodes: SceneNode[] = [];
  for (const cards of groupCardsByContext(cardRecords).values()) {
    const plan = buildArrangeAnnotationCardsPlan({
      basePosition: await getCardArrangeBasePosition(cards),
      cards: cards.map((card) => ({
        annotationNumber: card.record.annotationNumber,
        nodeId: card.node.id,
        rect: localRect(card.node),
      })),
    });
    movedNodes.push(...applyAnnotationPlan(plan, existingNodes).nodes);
  }

  ensureLayerOrder();
  return {
    movedCount: movedNodes.length,
    nodes: movedNodes,
  };
}

function applyAnnotationPlan(
  plan: CreateAnnotationPlan | AddAnnotationSubjectsPlan | ArrangeAnnotationBadgesPlan | ArrangeAnnotationCardsPlan,
  existingNodes: Map<string, BaseNode>,
): { nodes: SceneNode[] } {
  const containers = new Map<string, FrameNode>();
  const createdNodes = new Map<string, SceneNode>();
  const movedNodes: SceneNode[] = [];

  plan.operations.forEach((operation) => {
    if (operation.type === 'ensure-container') {
      containers.set(operation.ref, ensureContainer(operation.name));
      return;
    }

    if (operation.type === 'set-shared-plugin-data') {
      const node = resolvePlanTarget(operation.target, { containers, createdNodes, existingNodes });
      writeSharedPluginData(node, operation);
      return;
    }

    if (operation.type === 'create-annotation-card') {
      const container = resolveContainer(operation.containerRef, containers);
      createdNodes.set(operation.ref, createAnnotationCard(container, operation));
      return;
    }

    if (operation.type === 'create-annotation-badge') {
      const container = resolveContainer(operation.containerRef, containers);
      createdNodes.set(operation.ref, createAnnotationBadge(container, operation));
      return;
    }

    if (operation.type === 'append-shared-reference') {
      appendAnnotationReference(existingNodes, operation);
      return;
    }

    if (operation.type === 'move-node') {
      movedNodes.push(moveExistingNode(existingNodes, operation));
      return;
    }

    throw new Error(`Annotation adapter cannot apply ${operation.type}.`);
  });

  const container = containers.get('annotations');
  if (container !== undefined) {
    bringBadgesToFront(container);
  }
  return {
    nodes: 'createdNodeRefs' in plan ? plan.createdNodeRefs.map((ref) => {
      const node = createdNodes.get(ref);
      if (node === undefined) {
        throw new Error(`Annotation plan did not create ${ref}.`);
      }
      return node;
    }) : movedNodes,
  };
}

function createAnnotationCard(container: FrameNode, operation: CreateAnnotationCardOperation): FrameNode {
  const card = figma.createFrame();
  card.name = operation.name;
  card.fills = [solidPaint(1, 1, 1)];
  card.strokes = [solidPaint(0.21, 0.35, 0.55)];
  card.strokeWeight = 1;
  card.cornerRadius = 8;
  card.clipsContent = false;
  card.resize(CARD_WIDTH, 128);
  container.appendChild(card);

  const title = createText(`Annotation Number ${operation.annotationNumber}`, `Annotation #${operation.annotationNumber}`, 13, solidPaint(0.07, 0.12, 0.2), CARD_WIDTH - 32);
  card.appendChild(title);
  title.x = 16;
  title.y = 14;

  const subjectLabel = createText('Subject Nodes', `Subjects: ${operation.subjectSummary}`, 11, solidPaint(0.34, 0.4, 0.49), CARD_WIDTH - 32);
  card.appendChild(subjectLabel);
  subjectLabel.x = 16;
  subjectLabel.y = 38;

  const body = createText('Annotation Body', operation.body, 12, solidPaint(0.1, 0.1, 0.11), CARD_WIDTH - 32);
  card.appendChild(body);
  body.x = 16;
  body.y = 64;
  card.resize(CARD_WIDTH, Math.max(112, body.y + body.height + 18));

  const position = planAnnotationCardPosition({
    basePosition: operation.basePosition,
    cardRect: localRect(card),
    existingCardRects: getExistingAnnotationCardRects(container, card),
  });
  card.x = position.x;
  card.y = position.y;

  return card;
}

function createAnnotationBadge(container: FrameNode, operation: CreateAnnotationBadgeOperation): FrameNode {
  const badge = figma.createFrame();
  badge.name = operation.name;
  badge.fills = [solidPaint(0.88, 0.22, 0.2)];
  badge.strokes = [solidPaint(1, 1, 1)];
  badge.strokeWeight = 2;
  badge.cornerRadius = BADGE_SIZE / 2;
  badge.clipsContent = false;
  badge.resize(BADGE_SIZE, BADGE_SIZE);
  container.appendChild(badge);
  badge.x = operation.position.x;
  badge.y = operation.position.y;

  const number = createText('Annotation Badge Number', String(operation.annotationNumber), 12, solidPaint(1, 1, 1), BADGE_SIZE);
  number.textAutoResize = 'WIDTH_AND_HEIGHT';
  badge.appendChild(number);
  number.x = (BADGE_SIZE - number.width) / 2;
  number.y = (BADGE_SIZE - number.height) / 2;

  return badge;
}

function getSelectedAnnotationCard(): FrameNode {
  const selectedCards = figma.currentPage.selection.filter(isAnnotationCardNode);
  if (selectedCards.length !== 1) {
    throw new Error('Select exactly one Annotation Card root and one or more Subject Nodes.');
  }
  return selectedCards[0];
}

function isAnnotationCardNode(node: SceneNode): node is FrameNode {
  return (
    node.type === 'FRAME' &&
    node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) === VISUAL_NODE_KINDS.annotationCard
  );
}

function readAnnotationRecord(node: BaseNode): AnnotationRecord {
  const parsed = parseJson(node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotation));
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.id !== 'string' ||
    !isPositiveInteger(parsed.annotationNumber) ||
    typeof parsed.body !== 'string' ||
    parsed.body.trim().length === 0 ||
    typeof parsed.contextFrameId !== 'string' ||
    !Array.isArray(parsed.subjectNodeIds) ||
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.updatedAt !== 'string'
  ) {
    throw new Error('Selected Annotation Card does not contain a complete Annotation record.');
  }

  return {
    schemaVersion: 1,
    id: parsed.id,
    annotationNumber: parsed.annotationNumber,
    ...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
    body: parsed.body,
    ...(typeof parsed.kind === 'string' ? { kind: parsed.kind } : {}),
    contextFrameId: parsed.contextFrameId,
    subjectNodeIds: parsed.subjectNodeIds.filter((value): value is string => typeof value === 'string'),
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
}

function readBadgeRefRecord(node: BaseNode): BadgeRefRecord | null {
  const parsed = parseJson(node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.badgeRef));
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.annotationId !== 'string' ||
    !isPositiveInteger(parsed.annotationNumber) ||
    typeof parsed.subjectNodeId !== 'string' ||
    typeof parsed.contextFrameId !== 'string'
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    annotationId: parsed.annotationId,
    annotationNumber: parsed.annotationNumber,
    subjectNodeId: parsed.subjectNodeId,
    contextFrameId: parsed.contextFrameId,
  };
}

function getAnnotationBadgeRecords(container: FrameNode): { node: FrameNode; record: BadgeRefRecord }[] {
  return container.children.flatMap((child) => {
    if (
      child.type !== 'FRAME' ||
      child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) !== VISUAL_NODE_KINDS.annotationBadge
    ) {
      return [];
    }

    const record = readBadgeRefRecord(child);
    return record === null ? [] : [{ node: child, record }];
  });
}

function getBadgeSubjectNodeIds(container: FrameNode, annotationId: string): string[] {
  return getAnnotationBadgeRecords(container)
    .filter((badge) => badge.record.annotationId === annotationId)
    .map((badge) => badge.record.subjectNodeId);
}

function getAnnotationCardRecords(container: FrameNode): { node: FrameNode; record: AnnotationRecord }[] {
  return container.children.flatMap((child) => {
    if (!isAnnotationCardNode(child)) {
      return [];
    }
    return [{ node: child, record: readAnnotationRecord(child) }];
  });
}

function getAnnotationValidationCards(container: FrameNode): AnnotationValidationCardInput[] {
  return container.children.flatMap((child) => {
    if (!isAnnotationCardNode(child) || child.absoluteBoundingBox === null) {
      return [];
    }
    const record = readAnnotationValidationRecord(child);
    return record === null ? [] : [{
      nodeId: child.id,
      record,
      rect: child.absoluteBoundingBox,
    }];
  });
}

function getAnnotationValidationBadges(container: FrameNode): AnnotationValidationBadgeInput[] {
  return container.children.flatMap((child) => {
    if (
      child.type !== 'FRAME' ||
      child.absoluteBoundingBox === null ||
      child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) !== VISUAL_NODE_KINDS.annotationBadge
    ) {
      return [];
    }
    const record = readBadgeRefRecord(child);
    return record === null ? [] : [{
      nodeId: child.id,
      record,
      rect: child.absoluteBoundingBox,
    }];
  });
}

function readAnnotationValidationRecord(node: BaseNode): AnnotationValidationRecord | null {
  const parsed = parseJson(node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotation));
  if (
    !isRecord(parsed) ||
    typeof parsed.id !== 'string' ||
    !isPositiveInteger(parsed.annotationNumber) ||
    typeof parsed.body !== 'string' ||
    typeof parsed.contextFrameId !== 'string' ||
    !Array.isArray(parsed.subjectNodeIds)
  ) {
    return null;
  }

  return {
    id: parsed.id,
    annotationNumber: parsed.annotationNumber,
    body: parsed.body,
    contextFrameId: parsed.contextFrameId,
    subjectNodeIds: parsed.subjectNodeIds.filter((value): value is string => typeof value === 'string'),
  };
}

function groupCardsByContext(
  cards: { node: FrameNode; record: AnnotationRecord }[],
): Map<string, { node: FrameNode; record: AnnotationRecord }[]> {
  const groups = new Map<string, { node: FrameNode; record: AnnotationRecord }[]>();
  cards.forEach((card) => {
    const existing = groups.get(card.record.contextFrameId) ?? [];
    existing.push(card);
    groups.set(card.record.contextFrameId, existing);
  });
  return groups;
}

async function getCardArrangeBasePosition(cards: { node: FrameNode; record: AnnotationRecord }[]): Promise<Point> {
  const contextNode = await figma.getNodeByIdAsync(cards[0].record.contextFrameId);
  if (contextNode !== null && 'absoluteBoundingBox' in contextNode && contextNode.absoluteBoundingBox !== null) {
    return {
      x: contextNode.absoluteBoundingBox.x,
      y: contextNode.absoluteBoundingBox.y + contextNode.absoluteBoundingBox.height + 40,
    };
  }

  const currentRects = cards.map((card) => localRect(card.node));
  return {
    x: Math.min(...currentRects.map((rect) => rect.x)),
    y: Math.min(...currentRects.map((rect) => rect.y)),
  };
}

function getExistingAnnotationCardRects(container: FrameNode, card: FrameNode): Rect[] {
  return container.children.filter(
    (child): child is FrameNode =>
      child !== card &&
      child.type === 'FRAME' &&
      child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) === VISUAL_NODE_KINDS.annotationCard,
  ).map(localRect);
}

function resolveContainer(ref: string, containers: Map<string, FrameNode>): FrameNode {
  const container = containers.get(ref);
  if (container === undefined) {
    throw new Error(`Annotation plan references missing container ${ref}.`);
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
      throw new Error(`Annotation plan references missing created node ${target.ref}.`);
    }
    return node;
  }

  const node = refs.existingNodes.get(target.nodeId);
  if (node === undefined) {
    throw new Error(`Annotation plan references missing existing node ${target.nodeId}.`);
  }
  return node;
}

function writeSharedPluginData(node: BaseNode, operation: SetSharedPluginDataOperation): void {
  node.setSharedPluginData(
    NAMESPACE,
    operation.key,
    serializeSharedPluginDataValue(operation.value),
  );
}

function appendAnnotationReference(
  existingNodes: Map<string, BaseNode>,
  operation: AppendSharedReferenceOperation,
): void {
  if (operation.key !== SHARED_PLUGIN_DATA.keys.annotationRefs || operation.listKey !== 'annotationIds') {
    throw new Error('Annotation adapter can only apply annotation reverse references.');
  }

  const node = existingNodes.get(operation.targetNodeId);
  if (node === undefined) {
    throw new Error(`Annotation plan references missing Subject Node ${operation.targetNodeId}.`);
  }
  const record = mergeAnnotationReferenceIds(
    readReferenceIds(node, SHARED_PLUGIN_DATA.keys.annotationRefs, 'annotationIds'),
    operation.id,
  );
  node.setSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotationRefs, JSON.stringify(record));
}

function moveExistingNode(existingNodes: Map<string, BaseNode>, operation: MoveNodeOperation): SceneNode {
  const node = existingNodes.get(operation.targetNodeId);
  if (node === undefined || !('x' in node) || !('y' in node)) {
    throw new Error(`Annotation plan references missing movable node ${operation.targetNodeId}.`);
  }
  node.x = operation.position.x;
  node.y = operation.position.y;
  return node as SceneNode;
}

function findAnnotationContextNode(subjects: SceneNode[]): ContextDataNode {
  const commonFrame = findNearestCommonFrame(subjects);
  if (commonFrame === null) {
    return figma.currentPage;
  }
  return commonFrame;
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
  ensureLayerOrder();
  return container;
}

function findContainer(name: string): FrameNode | null {
  for (const child of figma.currentPage.children) {
    if (
      child.type === 'FRAME' &&
      child.name === name &&
      child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) === VISUAL_NODE_KINDS.container
    ) {
      return child;
    }
  }
  return null;
}

function collectCurrentPageNodes(): SceneNode[] {
  const result: SceneNode[] = [];
  const queue = [...figma.currentPage.children];

  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) {
      continue;
    }
    result.push(node);
    if ('children' in node) {
      queue.push(...node.children);
    }
  }

  return result;
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
    (child) => child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) === VISUAL_NODE_KINDS.annotationBadge,
  );
  badges.forEach((badge) => {
    container.appendChild(badge);
  });
}

function getNextAnnotationNumber(contextNode: ContextDataNode): number {
  const contextFrameId = contextNode.id;
  const contextRecord = readContextRecord(contextNode, contextFrameId);
  return contextRecord?.nextAnnotationNumber ?? getSeededNextAnnotationNumber(contextFrameId);
}

function readContextRecord(contextNode: ContextDataNode, contextFrameId: string): ContextRecord | null {
  const parsed = parseJson(contextNode.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.context));
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

function getSeededNextAnnotationNumber(contextFrameId: string): number {
  const container = findContainer(ANNOTATIONS_CONTAINER_NAME);
  if (container === null) {
    return 1;
  }

  let maxNumber = 0;
  container.children.forEach((node) => {
    if (node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) !== VISUAL_NODE_KINDS.annotationCard) {
      return;
    }

    const annotation = parseJson(node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotation));
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

function readReferenceIds(
  node: BaseNode,
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
    if (current.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) !== '') {
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

async function getExistingSceneNodes(nodeIds: string[]): Promise<SceneNode[]> {
  const nodes: SceneNode[] = [];
  for (const nodeId of nodeIds) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (node !== null && node.type !== 'PAGE' && 'absoluteBoundingBox' in node) {
      nodes.push(node as SceneNode);
    }
  }
  return nodes;
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

function postValidationReport(report: ValidationReport): void {
  figma.ui.postMessage({
    type: 'validation-report',
    report,
  });
}

function postSelectionState(): void {
  const selected = figma.currentPage.selection;
  const eligibleCount = selected.filter((node) => !hasGeneratedAncestor(node)).length;
  const selectedAnnotationCardCount = selected.filter(isAnnotationCardNode).length;
  const connectState = getConnectSelectionState(connectRuntime);
  figma.ui.postMessage({
    type: 'selection-state',
    totalCount: connectState.endpoints.length,
    eligibleCount,
    selectedAnnotationCardCount,
    connectorEndpoints: connectState.endpoints,
    existingConnector: connectState.existingConnector,
    routingStatus: connectState.routingStatus,
  });
}
