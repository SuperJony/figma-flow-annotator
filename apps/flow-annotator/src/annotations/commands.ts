import {
  type AddAnnotationSubjectsOperationBatch,
  ANNOTATIONS_CONTAINER_NAME,
  type AnnotationRecord,
  type ArrangeAnnotationBadgesOperationBatch,
  type ArrangeAnnotationCardsOperationBatch,
  buildAddAnnotationSubjectsOperationBatch,
  buildArrangeAnnotationBadgesOperationBatch,
  buildArrangeAnnotationCardsOperationBatch,
  type CreateAnnotationOperationBatch,
  type Point,
  planAnnotationAuthoring,
} from "@figma-flow-annotator/core";
import { applyFigmaFileOperationBatch } from "../figma/file-operations";
import {
  bringBadgesToFront,
  createId,
  ensureLayerOrder,
  findContainer,
  getVisibleBounds,
  hasGeneratedAncestor,
  localRect,
  NAMESPACE,
} from "../figma/runtime";
import { createAnnotationVisualWriter } from "./annotation-visual-writer";
import {
  collectAddAnnotationSubjectsAuthoringSnapshot,
  collectCreateAnnotationAuthoringSnapshot,
} from "./authoring-snapshot";
import {
  getAnnotationBadgeRecords,
  getAnnotationCardRecords,
  getSelectedAnnotationCard,
  readAnnotationRecord,
} from "./records";

export interface AnnotationCreationResult {
  annotationNumber: number;
  badgeCount: number;
  mode: "created" | "updated";
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

export async function createAnnotations(bodyValue: string): Promise<AnnotationCreationResult> {
  const snapshot = await collectCreateAnnotationAuthoringSnapshot({
    body: bodyValue,
    now: new Date().toISOString(),
  });
  const plan = planAnnotationAuthoring({
    ...snapshot.input,
    createAnnotationId: () => createId("annotation"),
  });
  const batch = plan.batch;
  const reusableNode =
    plan.mode === "reuse"
      ? snapshot.annotationCardNodesById.get(plan.reusableAnnotationCardNodeId)
      : undefined;
  const applied = applyAnnotationOperationBatch(
    batch,
    reusableNode === undefined
      ? snapshot.existingNodesById
      : new Map([...snapshot.existingNodesById, [reusableNode.id, reusableNode]]),
  );

  ensureLayerOrder();
  return {
    annotationNumber: batch.annotationNumber,
    badgeCount: batch.badgeCount,
    mode: plan.mode === "create" ? "created" : "updated",
    nodes:
      applied.nodes.length > 0 ? applied.nodes : reusableNode === undefined ? [] : [reusableNode],
  };
}

export function addSubjectNodesToAnnotation(): AddSubjectsResult {
  const annotationCard = getSelectedAnnotationCard();
  const annotation = readAnnotationRecord(annotationCard);
  const snapshot = collectAddAnnotationSubjectsAuthoringSnapshot({
    annotation,
    annotationCard,
    now: new Date().toISOString(),
  });
  const batch = buildAddAnnotationSubjectsOperationBatch(snapshot.input);
  const applied = applyAnnotationOperationBatch(batch, snapshot.existingNodesById);

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
    writer: createAnnotationVisualWriter(),
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
