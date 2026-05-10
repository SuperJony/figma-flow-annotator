import {
  ANNOTATIONS_CONTAINER_NAME,
  type AnnotationRecord,
  type BuildAddAnnotationSubjectsOperationBatchInput,
  decodeAnnotationNumberSeedRecord,
  decodeContextRecord,
  type PlanCreateAnnotationAuthoringInput,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import {
  findContainer,
  getVisibleBounds,
  hasGeneratedAncestor,
  NAMESPACE,
  readReferenceIds,
} from "../figma/runtime";
import { getBadgeSubjectNodeIds } from "./records";

export interface CreateAnnotationAuthoringSnapshot {
  existingNodesById: Map<string, BaseNode>;
  input: PlanCreateAnnotationAuthoringInput;
}

export interface AddAnnotationSubjectsAuthoringSnapshot {
  existingNodesById: Map<string, BaseNode>;
  input: BuildAddAnnotationSubjectsOperationBatchInput;
}

export function collectCreateAnnotationAuthoringSnapshot(input: {
  annotationId: string;
  body: string;
  now: string;
}): CreateAnnotationAuthoringSnapshot {
  const subjects = figma.currentPage.selection.filter((node) => !hasGeneratedAncestor(node));
  const contextNodesById = collectAnnotationContextNodes(subjects);

  return {
    existingNodesById: new Map([
      ...contextNodesById,
      ...subjects.map((subject): [string, BaseNode] => [subject.id, subject]),
    ]),
    input: {
      annotationId: input.annotationId,
      body: input.body,
      contextRecords: collectContextRecords(contextNodesById),
      existingAnnotationNumberSeeds: collectAnnotationNumberSeeds(
        findContainer(ANNOTATIONS_CONTAINER_NAME),
      ),
      now: input.now,
      pageId: figma.currentPage.id,
      subjects: subjects.map(toCreateAnnotationAuthoringSubject),
    },
  };
}

export function collectAddAnnotationSubjectsAuthoringSnapshot(input: {
  annotation: AnnotationRecord;
  annotationCard: FrameNode;
  now: string;
}): AddAnnotationSubjectsAuthoringSnapshot {
  const subjects = figma.currentPage.selection.filter(
    (node) => node !== input.annotationCard && !hasGeneratedAncestor(node),
  );
  const annotationsContainer = findContainer(ANNOTATIONS_CONTAINER_NAME);

  return {
    existingNodesById: new Map([
      [input.annotationCard.id, input.annotationCard],
      ...subjects.map((subject): [string, BaseNode] => [subject.id, subject]),
    ]),
    input: {
      annotation: input.annotation,
      annotationCardNodeId: input.annotationCard.id,
      existingBadgeSubjectNodeIds:
        annotationsContainer === null
          ? []
          : getBadgeSubjectNodeIds(annotationsContainer, input.annotation.id),
      now: input.now,
      subjects: subjects.map(toAnnotationSubjectInput),
    },
  };
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

function collectContextRecords(contextNodes: Map<string, FrameNode | PageNode>) {
  return [...contextNodes.values()].flatMap((node) => {
    const record = decodeContextRecord(
      node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.context),
      node.id,
    );
    return record === null ? [] : [record];
  });
}

function collectAnnotationNumberSeeds(container: FrameNode | null) {
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

function toCreateAnnotationAuthoringSubject(subject: SceneNode) {
  return {
    ...toAnnotationSubjectInput(subject),
    ancestorFrameIds: getFrameAncestorIds(subject),
  };
}

function toAnnotationSubjectInput(subject: SceneNode) {
  return {
    bounds: getVisibleBounds(subject),
    existingAnnotationRefCount: readReferenceIds(
      subject,
      SHARED_PLUGIN_DATA.keys.annotationRefs,
      "annotationIds",
    ).length,
    id: subject.id,
    name: subject.name,
  };
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
