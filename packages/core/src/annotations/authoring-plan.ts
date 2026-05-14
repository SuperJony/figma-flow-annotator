import type {
  AddAnnotationSubjectsOperationBatch,
  CreateAnnotationOperationBatch,
} from "../figma-file/operation-types.ts";
import type {
  AnnotationNumberSeedRecord,
  AnnotationRecord,
  ContextRecord,
} from "../shared/plugin-data.ts";
import {
  type AnnotationSubjectInput,
  buildAddAnnotationSubjectsOperationBatch,
  buildCreateAnnotationOperationBatch,
} from "./operations.ts";

export interface CreateAnnotationAuthoringSubjectInput extends AnnotationSubjectInput {
  ancestorFrameIds: string[];
}

export interface ExistingAnnotationCardAuthoringInput {
  annotationCardNodeId: string;
  existingBadgeSubjectNodeIds: string[];
  record: AnnotationRecord | null;
  seed: AnnotationNumberSeedRecord;
  subjectAncestorFrameIds: string[][];
}

export interface PlanAnnotationAuthoringInput {
  body: string;
  contextRecords: ContextRecord[];
  createAnnotationId: () => string;
  existingAnnotationCards: ExistingAnnotationCardAuthoringInput[];
  now: string;
  pageId: string;
  subjects: CreateAnnotationAuthoringSubjectInput[];
}

export type AnnotationAuthoringPlan =
  | {
      annotationNumber: number;
      batch: CreateAnnotationOperationBatch;
      contextFrameId: string;
      mode: "create";
    }
  | {
      annotationNumber: number;
      batch: AddAnnotationSubjectsOperationBatch;
      contextFrameId: string;
      mode: "reuse";
      reusableAnnotationCardNodeId: string;
    };

type ExistingAnnotationCardWithRecord = Omit<ExistingAnnotationCardAuthoringInput, "record"> & {
  record: AnnotationRecord;
};

export function planAnnotationAuthoring(
  input: PlanAnnotationAuthoringInput,
): AnnotationAuthoringPlan {
  const contextFrameId = selectAnnotationContextFrameId({
    pageId: input.pageId,
    subjects: input.subjects,
  });
  const reusable = selectReusableAnnotation({
    body: input.body,
    contextFrameId,
    existingAnnotationCards: input.existingAnnotationCards,
    pageId: input.pageId,
  });

  if (reusable !== null) {
    const batch = buildAddAnnotationSubjectsOperationBatch({
      annotation: reusable.record,
      annotationCardNodeId: reusable.annotationCardNodeId,
      existingBadgeSubjectNodeIds: reusable.existingBadgeSubjectNodeIds,
      now: input.now,
      subjects: input.subjects.map(
        ({ ancestorFrameIds: _ancestorFrameIds, ...subject }) => subject,
      ),
    });
    return {
      annotationNumber: batch.annotationNumber,
      batch,
      contextFrameId,
      mode: "reuse",
      reusableAnnotationCardNodeId: reusable.annotationCardNodeId,
    };
  }

  const annotationNumber = selectNextAnnotationNumber({
    contextFrameId,
    contextRecords: input.contextRecords,
    existingAnnotationNumberSeeds: collectAnnotationNumberSeedsForContext({
      contextFrameId,
      existingAnnotationCards: input.existingAnnotationCards,
      pageId: input.pageId,
    }),
  });
  const batch = buildCreateAnnotationOperationBatch({
    annotationId: input.createAnnotationId(),
    annotationNumber,
    body: input.body,
    contextFrameId,
    now: input.now,
    subjects: input.subjects.map(({ ancestorFrameIds: _ancestorFrameIds, ...subject }) => subject),
  });

  return {
    annotationNumber,
    batch,
    contextFrameId,
    mode: "create",
  };
}

export function selectAnnotationContextFrameId(input: {
  pageId: string;
  subjects: { ancestorFrameIds: string[] }[];
}): string {
  const outermostFrameId = input.subjects[0]?.ancestorFrameIds[0];

  if (
    outermostFrameId !== undefined &&
    input.subjects.every((subject) => subject.ancestorFrameIds[0] === outermostFrameId)
  ) {
    return outermostFrameId;
  }

  return input.pageId;
}

function selectNextAnnotationNumber(input: {
  contextFrameId: string;
  contextRecords: ContextRecord[];
  existingAnnotationNumberSeeds: AnnotationNumberSeedRecord[];
}): number {
  const contextRecord = input.contextRecords.find(
    (record) => record.contextFrameId === input.contextFrameId,
  );
  const maxExistingNumber = input.existingAnnotationNumberSeeds
    .filter((seed) => seed.contextFrameId === input.contextFrameId)
    .reduce((max, seed) => Math.max(max, seed.annotationNumber), 0);
  return Math.max(contextRecord?.nextAnnotationNumber ?? 1, maxExistingNumber + 1);
}

function selectReusableAnnotation(input: {
  body: string;
  contextFrameId: string;
  existingAnnotationCards: ExistingAnnotationCardAuthoringInput[];
  pageId: string;
}): ExistingAnnotationCardWithRecord | null {
  const normalizedBody = input.body.trim();
  let reusable: ExistingAnnotationCardWithRecord | null = null;
  for (const existing of input.existingAnnotationCards) {
    if (
      !hasAnnotationRecord(existing) ||
      existing.record.body.trim() !== normalizedBody ||
      !isAnnotationInEffectiveContext(existing, input.contextFrameId, input.pageId)
    ) {
      continue;
    }

    if (reusable === null || compareAnnotationRecords(existing.record, reusable.record) < 0) {
      reusable = existing;
    }
  }

  return reusable;
}

function collectAnnotationNumberSeedsForContext(input: {
  contextFrameId: string;
  existingAnnotationCards: ExistingAnnotationCardAuthoringInput[];
  pageId: string;
}): AnnotationNumberSeedRecord[] {
  const seeds = input.existingAnnotationCards.map((existing) => existing.seed);
  for (const existing of input.existingAnnotationCards) {
    if (
      !hasAnnotationRecord(existing) ||
      existing.record.contextFrameId === input.contextFrameId ||
      !isAnnotationInEffectiveContext(existing, input.contextFrameId, input.pageId)
    ) {
      continue;
    }

    seeds.push({
      annotationNumber: existing.record.annotationNumber,
      contextFrameId: input.contextFrameId,
    });
  }
  return seeds;
}

function hasAnnotationRecord(
  existing: ExistingAnnotationCardAuthoringInput,
): existing is ExistingAnnotationCardWithRecord {
  return existing.record !== null;
}

function compareAnnotationRecords(first: AnnotationRecord, second: AnnotationRecord): number {
  return first.annotationNumber - second.annotationNumber || first.id.localeCompare(second.id);
}

function isAnnotationInEffectiveContext(
  existing: ExistingAnnotationCardWithRecord,
  contextFrameId: string,
  pageId: string,
): boolean {
  return (
    existing.record.contextFrameId === contextFrameId ||
    existing.subjectAncestorFrameIds.some(
      (ancestorFrameIds) =>
        selectAnnotationContextFrameId({
          pageId,
          subjects: [{ ancestorFrameIds }],
        }) === contextFrameId,
    )
  );
}
