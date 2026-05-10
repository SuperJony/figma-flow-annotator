import {
  type AddAnnotationSubjectsOperationBatch,
  ANNOTATIONS_CONTAINER_NAME,
  type AnnotationRecord,
  type ArrangeAnnotationBadgesOperationBatch,
  type ArrangeAnnotationCardsOperationBatch,
  buildAddAnnotationSubjectsOperationBatch,
  buildArrangeAnnotationBadgesOperationBatch,
  buildArrangeAnnotationCardsOperationBatch,
  type CreateAnnotationBadgeOperation,
  type CreateAnnotationCardOperation,
  type CreateAnnotationOperationBatch,
  decodeAnnotationNumberSeedRecord,
  decodeContextRecord,
  getAnnotationCardBasePosition,
  getAnnotationCardRenderedHeight,
  getCenteredAnnotationBadgeNumberPosition,
  type Point,
  planCreateAnnotationAuthoring,
  type RgbColor,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import { applyFigmaFileOperationBatch } from "../figma/file-operations";
import {
  bringBadgesToFront,
  createId,
  createText,
  ensureContainer,
  ensureLayerOrder,
  findContainer,
  getVisibleBounds,
  hasGeneratedAncestor,
  localRect,
  NAMESPACE,
  readReferenceIds,
  solidPaint,
} from "../figma/runtime";
import {
  getAnnotationBadgeRecords,
  getAnnotationCardRecords,
  getBadgeSubjectNodeIds,
  getSelectedAnnotationCard,
  readAnnotationRecord,
} from "./records";

export interface AnnotationCreationResult {
  annotationNumber: number;
  badgeCount: number;
  nodes: SceneNode[];
}

export interface AddSubjectsResult {
  addedSubjectCount: number;
  annotationNumber: number;
  badgeCount: number;
  nodes: SceneNode[];
}

export interface ArrangeResult {
  movedCount: number;
  nodes: SceneNode[];
}

export function createAnnotations(bodyValue: string): AnnotationCreationResult {
  const subjects = figma.currentPage.selection.filter((node) => !hasGeneratedAncestor(node));
  const contextNodes = collectAnnotationContextNodes(subjects);
  const now = new Date().toISOString();
  const plan = planCreateAnnotationAuthoring({
    annotationId: createId("annotation"),
    body: bodyValue,
    contextRecords: getContextRecords(contextNodes),
    existingAnnotationNumberSeeds: getAnnotationNumberSeeds(
      findContainer(ANNOTATIONS_CONTAINER_NAME),
    ),
    now,
    pageId: figma.currentPage.id,
    subjects: subjects.map((subject) => ({
      ancestorFrameIds: getFrameAncestorIds(subject),
      bounds: getVisibleBounds(subject),
      existingAnnotationRefCount: readReferenceIds(subject, "annotationRefs", "annotationIds")
        .length,
      id: subject.id,
      name: subject.name,
    })),
  });
  const batch = plan.batch;
  const contextNode = contextNodes.get(plan.contextFrameId);
  if (contextNode === undefined) {
    throw new Error(`Missing Annotation context ${plan.contextFrameId}.`);
  }
  const applied = applyAnnotationOperationBatch(
    batch,
    new Map([
      [contextNode.id, contextNode],
      ...subjects.map((subject): [string, BaseNode] => [subject.id, subject]),
    ]),
  );

  ensureLayerOrder();
  return {
    annotationNumber: batch.annotationNumber,
    badgeCount: batch.badgeCount,
    nodes: applied.nodes,
  };
}

export function addSubjectNodesToAnnotation(): AddSubjectsResult {
  const annotationCard = getSelectedAnnotationCard();
  const annotation = readAnnotationRecord(annotationCard);
  const subjects = figma.currentPage.selection.filter(
    (node) => node !== annotationCard && !hasGeneratedAncestor(node),
  );
  const annotationsContainer = ensureContainer(ANNOTATIONS_CONTAINER_NAME);
  const now = new Date().toISOString();
  const batch = buildAddAnnotationSubjectsOperationBatch({
    annotation,
    annotationCardNodeId: annotationCard.id,
    existingBadgeSubjectNodeIds: getBadgeSubjectNodeIds(annotationsContainer, annotation.id),
    now,
    subjects: subjects.map((subject) => ({
      bounds: getVisibleBounds(subject),
      existingAnnotationRefCount: readReferenceIds(subject, "annotationRefs", "annotationIds")
        .length,
      id: subject.id,
      name: subject.name,
    })),
  });
  const existingNodes = new Map<string, BaseNode>([
    [annotationCard.id, annotationCard],
    ...subjects.map((subject): [string, BaseNode] => [subject.id, subject]),
  ]);
  const applied = applyAnnotationOperationBatch(batch, existingNodes);

  ensureLayerOrder();
  return {
    addedSubjectCount: batch.addedSubjectNodeIds.length,
    annotationNumber: batch.annotationNumber,
    badgeCount: batch.badgeCount,
    nodes: applied.nodes.length > 0 ? applied.nodes : [annotationCard],
  };
}

export function arrangeBadgesForSelectedSubjects(): ArrangeResult {
  const subjects = figma.currentPage.selection.filter((node) => !hasGeneratedAncestor(node));
  const annotationsContainer = findContainer(ANNOTATIONS_CONTAINER_NAME);
  if (annotationsContainer === null) {
    throw new Error("No Annotation Badges found to arrange.");
  }

  const badgeRecords = getAnnotationBadgeRecords(annotationsContainer);
  const batch = buildArrangeAnnotationBadgesOperationBatch({
    subjects: subjects
      .map((subject) => ({
        badges: badgeRecords
          .filter((badge) => badge.record.subjectNodeId === subject.id)
          .map((badge) => ({
            annotationNumber: badge.record.annotationNumber,
            nodeId: badge.node.id,
          })),
        bounds: getVisibleBounds(subject),
        id: subject.id,
      }))
      .filter((subject) => subject.badges.length > 0),
  });
  const existingNodes = new Map<string, BaseNode>(
    badgeRecords.map((badge) => [badge.node.id, badge.node]),
  );
  const applied = applyAnnotationOperationBatch(batch, existingNodes);
  bringBadgesToFront(annotationsContainer);
  return {
    movedCount: batch.movedBadgeNodeIds.length,
    nodes: applied.nodes,
  };
}

export async function arrangeAnnotationCards(): Promise<ArrangeResult> {
  const annotationsContainer = findContainer(ANNOTATIONS_CONTAINER_NAME);
  if (annotationsContainer === null) {
    throw new Error("No Annotation Cards found to arrange.");
  }

  const cardRecords = getAnnotationCardRecords(annotationsContainer);
  if (cardRecords.length === 0) {
    throw new Error("No Annotation Cards found to arrange.");
  }

  const existingNodes = new Map<string, BaseNode>(
    cardRecords.map((card) => [card.node.id, card.node]),
  );
  const movedNodes: SceneNode[] = [];
  for (const cards of groupCardsByContext(cardRecords).values()) {
    const batch = buildArrangeAnnotationCardsOperationBatch({
      basePosition: await getCardArrangeBasePosition(cards),
      cards: cards.map((card) => ({
        annotationNumber: card.record.annotationNumber,
        nodeId: card.node.id,
        rect: localRect(card.node),
      })),
    });
    movedNodes.push(...applyAnnotationOperationBatch(batch, existingNodes).nodes);
  }

  ensureLayerOrder();
  return {
    movedCount: movedNodes.length,
    nodes: movedNodes,
  };
}

function applyAnnotationOperationBatch(
  batch:
    | CreateAnnotationOperationBatch
    | AddAnnotationSubjectsOperationBatch
    | ArrangeAnnotationBadgesOperationBatch
    | ArrangeAnnotationCardsOperationBatch,
  existingNodes: Map<string, BaseNode>,
): { nodes: SceneNode[] } {
  const applied = applyFigmaFileOperationBatch({
    batch,
    existingNodes,
    namespace: NAMESPACE,
    writer: {
      createAnnotationBadge,
      createAnnotationCard,
      ensureContainer,
    },
  });

  const container = applied.containers.get("annotations");
  if (container !== undefined) {
    bringBadgesToFront(container);
  }
  return {
    nodes:
      "createdNodeRefs" in batch
        ? batch.createdNodeRefs.map((ref) => {
            const node = applied.createdNodes.get(ref);
            if (node === undefined) {
              throw new Error(`Annotation operation batch did not create ${ref}.`);
            }
            return node;
          })
        : applied.movedNodes,
  };
}

function createAnnotationCard(
  container: FrameNode,
  operation: CreateAnnotationCardOperation,
): FrameNode {
  const card = figma.createFrame();
  const visual = operation.visual;
  card.name = operation.name;
  card.fills = [solidPaintFromRgb(visual.frame.fill)];
  card.strokes = [solidPaintFromRgb(visual.frame.stroke)];
  card.strokeWeight = visual.frame.strokeWeight;
  card.cornerRadius = visual.frame.cornerRadius;
  card.clipsContent = false;
  card.resize(visual.frame.width, visual.frame.initialHeight);
  container.appendChild(card);

  const title = createText(
    visual.title.name,
    visual.title.text,
    visual.title.fontSize,
    solidPaintFromRgb(visual.title.fill),
    visual.title.width,
  );
  card.appendChild(title);
  title.x = visual.title.x;
  title.y = visual.title.y;

  const subjectLabel = createText(
    visual.subjectLabel.name,
    visual.subjectLabel.text,
    visual.subjectLabel.fontSize,
    solidPaintFromRgb(visual.subjectLabel.fill),
    visual.subjectLabel.width,
  );
  card.appendChild(subjectLabel);
  subjectLabel.x = visual.subjectLabel.x;
  subjectLabel.y = visual.subjectLabel.y;

  const body = createText(
    visual.body.name,
    visual.body.text,
    visual.body.fontSize,
    solidPaintFromRgb(visual.body.fill),
    visual.body.width,
  );
  card.appendChild(body);
  body.x = visual.body.x;
  body.y = visual.body.y;
  card.resize(
    visual.frame.width,
    getAnnotationCardRenderedHeight({ bodyHeight: body.height, visual }),
  );

  const position = getAnnotationCardBasePosition({
    basePosition: operation.basePosition,
    cardRect: localRect(card),
    existingCardRects: getExistingAnnotationCardRects(container, card),
  });
  card.x = position.x;
  card.y = position.y;

  return card;
}

function createAnnotationBadge(
  container: FrameNode,
  operation: CreateAnnotationBadgeOperation,
): FrameNode {
  const badge = figma.createFrame();
  const visual = operation.visual;
  badge.name = operation.name;
  badge.fills = [solidPaintFromRgb(visual.frame.fill)];
  badge.strokes = [solidPaintFromRgb(visual.frame.stroke)];
  badge.strokeWeight = visual.frame.strokeWeight;
  badge.cornerRadius = visual.frame.cornerRadius;
  badge.clipsContent = false;
  badge.resize(visual.frame.size, visual.frame.size);
  container.appendChild(badge);
  badge.x = operation.position.x;
  badge.y = operation.position.y;

  const number = createText(
    visual.number.name,
    visual.number.text,
    visual.number.fontSize,
    solidPaintFromRgb(visual.number.fill),
    visual.number.width,
  );
  number.textAutoResize = "WIDTH_AND_HEIGHT";
  badge.appendChild(number);
  const numberPosition = getCenteredAnnotationBadgeNumberPosition({
    badgeVisual: visual,
    textHeight: number.height,
    textWidth: number.width,
  });
  number.x = numberPosition.x;
  number.y = numberPosition.y;

  return badge;
}

function solidPaintFromRgb(color: RgbColor): SolidPaint {
  return solidPaint(color.r, color.g, color.b);
}

function getExistingAnnotationCardRects(container: FrameNode, card: FrameNode): Rect[] {
  return container.children
    .filter(
      (child): child is FrameNode =>
        child !== card &&
        child.type === "FRAME" &&
        child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) ===
          VISUAL_NODE_KINDS.annotationCard,
    )
    .map(localRect);
}

function collectAnnotationContextNodes(subjects: SceneNode[]): Map<string, FrameNode | PageNode> {
  const contextNodes = new Map<string, FrameNode | PageNode>([
    [figma.currentPage.id, figma.currentPage],
  ]);
  subjects.forEach((subject) => {
    let current: BaseNode | null = subject;
    while (current !== null && current.type !== "PAGE") {
      if (current.type === "FRAME") {
        contextNodes.set(current.id, current);
      }
      current = current.parent;
    }
  });
  return contextNodes;
}

function getContextRecords(contextNodes: Map<string, FrameNode | PageNode>) {
  return [...contextNodes.values()].flatMap((node) => {
    const record = decodeContextRecord(
      node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.context),
      node.id,
    );
    return record === null ? [] : [record];
  });
}

function getAnnotationNumberSeeds(container: FrameNode | null) {
  if (container === null) {
    return [];
  }

  return container.children.flatMap((node) => {
    if (
      node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) !==
      VISUAL_NODE_KINDS.annotationCard
    ) {
      return [];
    }

    const seed = decodeAnnotationNumberSeedRecord(
      node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotation),
    );
    return seed === null ? [] : [seed];
  });
}

function getFrameAncestorIds(node: SceneNode): string[] {
  const chain: string[] = [];
  let current: BaseNode | null = node;
  while (current !== null && current.type !== "PAGE") {
    if (current.type === "FRAME") {
      chain.unshift(current.id);
    }
    current = current.parent;
  }
  return chain;
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

async function getCardArrangeBasePosition(
  cards: { node: FrameNode; record: AnnotationRecord }[],
): Promise<Point> {
  const contextNode = await figma.getNodeByIdAsync(cards[0].record.contextFrameId);
  if (
    contextNode !== null &&
    "absoluteBoundingBox" in contextNode &&
    contextNode.absoluteBoundingBox !== null
  ) {
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
