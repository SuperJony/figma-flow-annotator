import type {
  AddAnnotationSubjectsOperationBatch,
  ArrangeAnnotationBadgesOperationBatch,
  ArrangeAnnotationCardsOperationBatch,
  CreateAnnotationOperationBatch,
  FigmaFileOperation,
  MoveNodeOperation,
} from "../figma-file/operation-types.ts";
import type { Point, RectLike } from "../shared/geometry.ts";
import { unionRects } from "../shared/geometry.ts";
import type { AnnotationRecord } from "../shared/plugin-data.ts";
import {
  ANNOTATIONS_CONTAINER_NAME,
  createAnnotationRecord,
  createBadgeRefRecord,
  createContextRecord,
  formatAnnotationBadgeName,
  formatAnnotationCardName,
  SHARED_PLUGIN_DATA,
  summarizeSubjectNames,
  VISUAL_NODE_KINDS,
} from "../shared/plugin-data.ts";
import {
  ANNOTATION_CARD_LAYOUT,
  buildAnnotationBadgeVisualModel,
  buildAnnotationCardVisualModel,
  getAnnotationBadgePosition,
  getAnnotationCardCreationBasePosition,
} from "./visual-model.ts";

export interface AnnotationSubjectInput {
  id: string;
  name: string;
  bounds: RectLike;
  existingAnnotationRefCount: number;
}

export interface BuildCreateAnnotationOperationBatchInput {
  annotationId: string;
  annotationNumber: number;
  body: string;
  contextFrameId: string;
  now: string;
  subjects: AnnotationSubjectInput[];
}

export interface BuildAddAnnotationSubjectsOperationBatchInput {
  annotationCardNodeId: string;
  annotation: AnnotationRecord;
  existingBadgeSubjectNodeIds: string[];
  now: string;
  subjects: AnnotationSubjectInput[];
}

export interface AnnotationBadgeLayoutInput {
  annotationNumber: number;
  nodeId: string;
}

export interface SubjectBadgeLayoutInput {
  bounds: RectLike;
  badges: AnnotationBadgeLayoutInput[];
  id: string;
}

export interface BuildArrangeAnnotationBadgesOperationBatchInput {
  subjects: SubjectBadgeLayoutInput[];
}

export interface AnnotationCardLayoutInput {
  annotationNumber: number;
  nodeId: string;
  rect: RectLike;
}

export interface BuildArrangeAnnotationCardsOperationBatchInput {
  basePosition: Point;
  cards: AnnotationCardLayoutInput[];
}

export function buildCreateAnnotationOperationBatch(
  input: BuildCreateAnnotationOperationBatchInput,
): CreateAnnotationOperationBatch {
  const body = input.body.trim();
  if (body.length === 0) {
    throw new Error("Annotation Body is required.");
  }
  if (input.subjects.length === 0) {
    throw new Error("Select one or more non-generated Subject Nodes.");
  }

  const record = createAnnotationRecord({
    annotationId: input.annotationId,
    annotationNumber: input.annotationNumber,
    body,
    contextFrameId: input.contextFrameId,
    now: input.now,
    subjectNodeIds: input.subjects.map((subject) => subject.id),
  });
  const contextRecord = createContextRecord(input.contextFrameId, input.annotationNumber + 1);
  const cardRef = "annotation-card";
  const annotationBounds = unionRects(input.subjects.map((subject) => subject.bounds));
  const subjectSummary = summarizeSubjectNames(input.subjects.map((subject) => subject.name));
  const operations: FigmaFileOperation[] = [
    {
      type: "ensure-container",
      ref: "annotations",
      name: ANNOTATIONS_CONTAINER_NAME,
    },
    {
      type: "set-shared-plugin-data",
      target: { kind: "container", ref: "annotations" },
      key: SHARED_PLUGIN_DATA.keys.kind,
      value: VISUAL_NODE_KINDS.container,
    },
    {
      type: "set-shared-plugin-data",
      target: { kind: "existing-node", nodeId: input.contextFrameId },
      key: SHARED_PLUGIN_DATA.keys.context,
      value: contextRecord,
    },
    {
      type: "create-annotation-card",
      ref: cardRef,
      containerRef: "annotations",
      name: formatAnnotationCardName(input.annotationNumber),
      annotationNumber: input.annotationNumber,
      body,
      subjectSummary,
      basePosition: getAnnotationCardCreationBasePosition({ subjectBounds: annotationBounds }),
      visual: buildAnnotationCardVisualModel({
        annotationNumber: input.annotationNumber,
        body,
        subjectSummary,
      }),
    },
    {
      type: "set-shared-plugin-data",
      target: { kind: "created-node", ref: cardRef },
      key: SHARED_PLUGIN_DATA.keys.kind,
      value: VISUAL_NODE_KINDS.annotationCard,
    },
    {
      type: "set-shared-plugin-data",
      target: { kind: "created-node", ref: cardRef },
      key: SHARED_PLUGIN_DATA.keys.annotation,
      value: record,
    },
  ];

  input.subjects.forEach((subject, index) => {
    const badgeRef = createBadgeRefRecord({
      annotationId: input.annotationId,
      annotationNumber: input.annotationNumber,
      contextFrameId: input.contextFrameId,
      subjectNodeId: subject.id,
    });
    const nodeRef = `annotation-badge-${index + 1}`;
    operations.push(
      {
        type: "create-annotation-badge",
        ref: nodeRef,
        containerRef: "annotations",
        name: formatAnnotationBadgeName(input.annotationNumber),
        annotationNumber: input.annotationNumber,
        subjectNodeId: subject.id,
        position: getAnnotationBadgePosition({
          badgeIndex: subject.existingAnnotationRefCount,
          subjectBounds: subject.bounds,
        }),
        visual: buildAnnotationBadgeVisualModel({ annotationNumber: input.annotationNumber }),
      },
      {
        type: "set-shared-plugin-data",
        target: { kind: "created-node", ref: nodeRef },
        key: SHARED_PLUGIN_DATA.keys.kind,
        value: VISUAL_NODE_KINDS.annotationBadge,
      },
      {
        type: "set-shared-plugin-data",
        target: { kind: "created-node", ref: nodeRef },
        key: SHARED_PLUGIN_DATA.keys.badgeRef,
        value: badgeRef,
      },
      {
        type: "append-shared-reference",
        targetNodeId: subject.id,
        key: SHARED_PLUGIN_DATA.keys.annotationRefs,
        listKey: "annotationIds",
        id: input.annotationId,
      },
    );
  });

  return {
    schemaVersion: 1,
    kind: "create-annotation",
    annotationId: input.annotationId,
    annotationNumber: input.annotationNumber,
    badgeCount: input.subjects.length,
    createdNodeRefs: [
      cardRef,
      ...input.subjects.map((_subject, index) => `annotation-badge-${index + 1}`),
    ],
    operations,
    record,
  };
}

export function buildAddAnnotationSubjectsOperationBatch(
  input: BuildAddAnnotationSubjectsOperationBatchInput,
): AddAnnotationSubjectsOperationBatch {
  if (input.annotation.body.trim().length === 0) {
    throw new Error("Annotation Body is required.");
  }
  if (input.subjects.length === 0) {
    throw new Error("Select one or more Subject Nodes to add.");
  }

  const existingSubjectIds = new Set(input.annotation.subjectNodeIds);
  const addedSubjects = input.subjects.filter((subject) => !existingSubjectIds.has(subject.id));
  const addedSubjectIds = addedSubjects.map((subject) => subject.id);
  const updatedSubjectNodeIds = [...input.annotation.subjectNodeIds, ...addedSubjectIds];
  const record: AnnotationRecord = {
    ...input.annotation,
    subjectNodeIds: updatedSubjectNodeIds,
    updatedAt: addedSubjectIds.length > 0 ? input.now : input.annotation.updatedAt,
  };
  const existingBadgeSubjectIds = new Set(input.existingBadgeSubjectNodeIds);
  const subjectsNeedingBadges = addedSubjects.filter(
    (subject) => !existingBadgeSubjectIds.has(subject.id),
  );
  const operations: FigmaFileOperation[] = [];

  if (subjectsNeedingBadges.length > 0) {
    operations.push(
      {
        type: "ensure-container",
        ref: "annotations",
        name: ANNOTATIONS_CONTAINER_NAME,
      },
      {
        type: "set-shared-plugin-data",
        target: { kind: "container", ref: "annotations" },
        key: SHARED_PLUGIN_DATA.keys.kind,
        value: VISUAL_NODE_KINDS.container,
      },
    );
  }

  if (addedSubjectIds.length > 0) {
    operations.push({
      type: "set-shared-plugin-data",
      target: { kind: "existing-node", nodeId: input.annotationCardNodeId },
      key: SHARED_PLUGIN_DATA.keys.annotation,
      value: record,
    });
  }

  subjectsNeedingBadges.forEach((subject, index) => {
    const badgeRef = createBadgeRefRecord({
      annotationId: input.annotation.id,
      annotationNumber: input.annotation.annotationNumber,
      contextFrameId: input.annotation.contextFrameId,
      subjectNodeId: subject.id,
    });
    const nodeRef = `annotation-badge-added-${index + 1}`;
    operations.push(
      {
        type: "create-annotation-badge",
        ref: nodeRef,
        containerRef: "annotations",
        name: formatAnnotationBadgeName(input.annotation.annotationNumber),
        annotationNumber: input.annotation.annotationNumber,
        subjectNodeId: subject.id,
        position: getAnnotationBadgePosition({
          badgeIndex: subject.existingAnnotationRefCount,
          subjectBounds: subject.bounds,
        }),
        visual: buildAnnotationBadgeVisualModel({
          annotationNumber: input.annotation.annotationNumber,
        }),
      },
      {
        type: "set-shared-plugin-data",
        target: { kind: "created-node", ref: nodeRef },
        key: SHARED_PLUGIN_DATA.keys.kind,
        value: VISUAL_NODE_KINDS.annotationBadge,
      },
      {
        type: "set-shared-plugin-data",
        target: { kind: "created-node", ref: nodeRef },
        key: SHARED_PLUGIN_DATA.keys.badgeRef,
        value: badgeRef,
      },
    );
  });

  addedSubjects.forEach((subject) => {
    operations.push({
      type: "append-shared-reference",
      targetNodeId: subject.id,
      key: SHARED_PLUGIN_DATA.keys.annotationRefs,
      listKey: "annotationIds",
      id: input.annotation.id,
    });
  });

  return {
    schemaVersion: 1,
    kind: "add-annotation-subjects",
    annotationId: input.annotation.id,
    annotationNumber: input.annotation.annotationNumber,
    addedSubjectNodeIds: addedSubjectIds,
    badgeCount: subjectsNeedingBadges.length,
    createdNodeRefs: subjectsNeedingBadges.map(
      (_subject, index) => `annotation-badge-added-${index + 1}`,
    ),
    operations,
    record,
  };
}

export function buildArrangeAnnotationBadgesOperationBatch(
  input: BuildArrangeAnnotationBadgesOperationBatchInput,
): ArrangeAnnotationBadgesOperationBatch {
  if (input.subjects.length === 0) {
    throw new Error("Select one or more Subject Nodes with Annotation Badges.");
  }

  const operations: MoveNodeOperation[] = [];
  input.subjects.forEach((subject) => {
    const sortedBadges = [...subject.badges].sort(compareAnnotationNumbersThenIds);
    sortedBadges.forEach((badge, index) => {
      operations.push({
        type: "move-node",
        targetNodeId: badge.nodeId,
        position: getAnnotationBadgePosition({
          badgeIndex: index,
          subjectBounds: subject.bounds,
        }),
      });
    });
  });

  return {
    schemaVersion: 1,
    kind: "arrange-annotation-badges",
    movedBadgeNodeIds: operations.map((operation) => operation.targetNodeId),
    operations,
  };
}

export function buildArrangeAnnotationCardsOperationBatch(
  input: BuildArrangeAnnotationCardsOperationBatchInput,
): ArrangeAnnotationCardsOperationBatch {
  if (input.cards.length === 0) {
    throw new Error("No Annotation Cards found to arrange.");
  }

  let nextY = input.basePosition.y;
  const operations = [...input.cards].sort(compareAnnotationNumbersThenIds).map((card) => {
    const operation: MoveNodeOperation = {
      type: "move-node",
      targetNodeId: card.nodeId,
      position: {
        x: input.basePosition.x,
        y: nextY,
      },
    };
    nextY += card.rect.height + ANNOTATION_CARD_LAYOUT.gap;
    return operation;
  });

  return {
    schemaVersion: 1,
    kind: "arrange-annotation-cards",
    movedCardNodeIds: operations.map((operation) => operation.targetNodeId),
    operations,
  };
}

function compareAnnotationNumbersThenIds(
  first: { annotationNumber: number; nodeId: string },
  second: { annotationNumber: number; nodeId: string },
): number {
  return (
    first.annotationNumber - second.annotationNumber || first.nodeId.localeCompare(second.nodeId)
  );
}
