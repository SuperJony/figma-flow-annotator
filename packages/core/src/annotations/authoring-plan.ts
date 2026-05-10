import type { CreateAnnotationOperationBatch } from "../figma-file/operation-types.ts";
import type { AnnotationNumberSeedRecord, ContextRecord } from "../shared/plugin-data.ts";
import { type AnnotationSubjectInput, buildCreateAnnotationOperationBatch } from "./operations.ts";

export interface CreateAnnotationAuthoringSubjectInput extends AnnotationSubjectInput {
  ancestorFrameIds: string[];
}

export interface PlanCreateAnnotationAuthoringInput {
  annotationId: string;
  body: string;
  contextRecords: ContextRecord[];
  existingAnnotationNumberSeeds: AnnotationNumberSeedRecord[];
  now: string;
  pageId: string;
  subjects: CreateAnnotationAuthoringSubjectInput[];
}

export interface CreateAnnotationAuthoringPlan {
  annotationNumber: number;
  batch: CreateAnnotationOperationBatch;
  contextFrameId: string;
}

export function planCreateAnnotationAuthoring(
  input: PlanCreateAnnotationAuthoringInput,
): CreateAnnotationAuthoringPlan {
  const contextFrameId = selectAnnotationContextFrameId({
    pageId: input.pageId,
    subjects: input.subjects,
  });
  const annotationNumber = selectNextAnnotationNumber({
    contextFrameId,
    contextRecords: input.contextRecords,
    existingAnnotationNumberSeeds: input.existingAnnotationNumberSeeds,
  });
  const batch = buildCreateAnnotationOperationBatch({
    annotationId: input.annotationId,
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
  };
}

export function selectAnnotationContextFrameId(input: {
  pageId: string;
  subjects: { ancestorFrameIds: string[] }[];
}): string {
  const firstChain = input.subjects[0]?.ancestorFrameIds ?? [];
  let commonFrameId: string | null = null;

  for (let index = 0; index < firstChain.length; index += 1) {
    const candidateId = firstChain[index];
    if (input.subjects.every((subject) => subject.ancestorFrameIds[index] === candidateId)) {
      commonFrameId = candidateId;
      continue;
    }
    break;
  }

  return commonFrameId ?? input.pageId;
}

export function selectNextAnnotationNumber(input: {
  contextFrameId: string;
  contextRecords: ContextRecord[];
  existingAnnotationNumberSeeds: AnnotationNumberSeedRecord[];
}): number {
  const contextRecord = input.contextRecords.find(
    (record) => record.contextFrameId === input.contextFrameId,
  );
  if (contextRecord !== undefined) {
    return contextRecord.nextAnnotationNumber;
  }

  const maxExistingNumber = input.existingAnnotationNumberSeeds
    .filter((seed) => seed.contextFrameId === input.contextFrameId)
    .reduce((max, seed) => Math.max(max, seed.annotationNumber), 0);
  return maxExistingNumber + 1;
}
