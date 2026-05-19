import type {
  AddAnnotationSubjectsOperationBatch,
  ArrangeAnnotationBadgesOperationBatch,
  ArrangeAnnotationCardsOperationBatch,
  CreateAnnotationOperationBatch,
  FigmaFileOperation,
  FigmaFileOperationTarget,
  MoveNodeOperation,
  UpdateValidationIndexOperation,
} from "../figma-file/operation-types.ts";
import type { Point, RectLike } from "../shared/geometry.ts";
import { unionRects } from "../shared/geometry.ts";
import type { AnnotationRecord } from "../shared/plugin-data.ts";
import {
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
  contextFrameBounds: RectLike | null;
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
  const cardAnchorBounds =
    input.contextFrameBounds ?? unionRects(input.subjects.map((subject) => subject.bounds));
  const subjectSummary = summarizeSubjectNames(input.subjects.map((subject) => subject.name));
  const operations: FigmaFileOperation[] = [
    {
      type: "set-shared-plugin-data",
      target: { kind: "existing-node", nodeId: input.contextFrameId },
      key: SHARED_PLUGIN_DATA.keys.context,
      value: contextRecord,
    },
    {
      type: "create-annotation-card",
      ref: cardRef,
      name: formatAnnotationCardName(input.annotationNumber),
      annotationNumber: input.annotationNumber,
      body,
      subjectSummary,
      basePosition: getAnnotationCardCreationBasePosition({ anchorBounds: cardAnchorBounds }),
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
  operations.push(
    buildUpdateAnnotationValidationIndexOperation({
      annotationBadgeNodeIdTargets: input.subjects.map((_subject, index) => ({
        kind: "created-node",
        ref: `annotation-badge-${index + 1}`,
      })),
      annotationCardNodeIdTarget: { kind: "created-node", ref: cardRef },
      contextFrameId: input.contextFrameId,
      subjectNodeIds: record.subjectNodeIds,
    }),
  );

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
  operations.push(
    buildUpdateAnnotationValidationIndexOperation({
      annotationBadgeNodeIdTargets: subjectsNeedingBadges.map((_subject, index) => ({
        kind: "created-node",
        ref: `annotation-badge-added-${index + 1}`,
      })),
      annotationCardNodeIdTarget: { kind: "existing-node", nodeId: input.annotationCardNodeId },
      contextFrameId: record.contextFrameId,
      subjectNodeIds: record.subjectNodeIds,
    }),
  );

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

  const operations: FigmaFileOperation[] = [];
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
  const movedBadgeNodeIds = operations.flatMap((operation) =>
    operation.type === "move-node" ? [operation.targetNodeId] : [],
  );
  operations.push({
    type: "update-validation-index",
    target: { kind: "current-page" },
    upsert: {
      nodeIds: {
        subjectNodeIds: input.subjects.map((subject) => subject.id),
      },
      nodeTargets: {
        annotationBadgeNodeIds: movedBadgeNodeIds.map((nodeId) => ({
          kind: "existing-node",
          nodeId,
        })),
      },
    },
  });

  return {
    schemaVersion: 1,
    kind: "arrange-annotation-badges",
    movedBadgeNodeIds,
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
  const moveOperations = [...input.cards].sort(compareAnnotationNumbersThenIds).map((card) => {
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
  const operations: FigmaFileOperation[] = [
    ...moveOperations,
    {
      type: "update-validation-index",
      target: { kind: "current-page" },
      upsert: {
        nodeTargets: {
          annotationCardNodeIds: moveOperations.map((operation) => ({
            kind: "existing-node",
            nodeId: operation.targetNodeId,
          })),
          connectorObstacleCandidateNodeIds: moveOperations.map((operation) => ({
            kind: "existing-node",
            nodeId: operation.targetNodeId,
          })),
        },
      },
    },
  ];

  return {
    schemaVersion: 1,
    kind: "arrange-annotation-cards",
    movedCardNodeIds: moveOperations.map((operation) => operation.targetNodeId),
    operations,
  };
}

function buildUpdateAnnotationValidationIndexOperation(input: {
  annotationBadgeNodeIdTargets: FigmaFileOperationTarget[];
  annotationCardNodeIdTarget: FigmaFileOperationTarget;
  contextFrameId: string;
  subjectNodeIds: string[];
}): UpdateValidationIndexOperation {
  return {
    type: "update-validation-index",
    target: { kind: "current-page" },
    upsert: {
      nodeIds: {
        contextFrameIds: [input.contextFrameId],
        subjectNodeIds: input.subjectNodeIds,
      },
      nodeTargets: {
        annotationBadgeNodeIds: input.annotationBadgeNodeIdTargets,
        annotationCardNodeIds: [input.annotationCardNodeIdTarget],
        connectorObstacleCandidateNodeIds: [input.annotationCardNodeIdTarget],
      },
    },
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
