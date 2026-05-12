import {
  ANNOTATIONS_CONTAINER_NAME,
  type AnnotationNumberSeedRecord,
  type AnnotationRecord,
  type BuildAddAnnotationSubjectsOperationBatchInput,
  decodeAnnotationNumberSeedRecord,
  decodeAnnotationRecord,
  decodeContextRecord,
  type PlanCreateAnnotationAuthoringInput,
  SHARED_PLUGIN_DATA,
} from "@figma-flow-annotator/core";
import {
  findContainer,
  getExistingSceneNodesById,
  getVisibleBounds,
  hasGeneratedAncestor,
  NAMESPACE,
  readReferenceIds,
} from "../figma/runtime";
import { getBadgeSubjectNodeIds, isAnnotationCardNode } from "./records";

type CreateAnnotationAuthoringBaseInput = Omit<
  PlanCreateAnnotationAuthoringInput,
  "existingAnnotationNumberSeeds"
>;

export interface CreateAnnotationAuthoringSnapshot {
  annotationCards: AnnotationCardsSnapshot;
  existingNodesById: Map<string, BaseNode>;
  input: CreateAnnotationAuthoringBaseInput;
}

export interface AddAnnotationSubjectsAuthoringSnapshot {
  existingNodesById: Map<string, BaseNode>;
  input: BuildAddAnnotationSubjectsOperationBatchInput;
}

export interface ReusableAnnotationCard {
  existingBadgeSubjectNodeIds: string[];
  node: FrameNode;
  record: AnnotationRecord;
}

export interface AnnotationCardsSnapshot {
  cards: {
    node: FrameNode;
    record: AnnotationRecord | null;
    seed: AnnotationNumberSeedRecord;
  }[];
  container: FrameNode | null;
}

export function collectCreateAnnotationAuthoringSnapshot(input: {
  annotationId: string;
  body: string;
  now: string;
}): CreateAnnotationAuthoringSnapshot {
  const subjects = figma.currentPage.selection.filter((node) => !hasGeneratedAncestor(node));
  const contextNodesById = collectAnnotationContextNodes(subjects);
  const annotationCards = collectAnnotationCardsSnapshot(findContainer(ANNOTATIONS_CONTAINER_NAME));

  return {
    annotationCards,
    existingNodesById: new Map([
      ...contextNodesById,
      ...subjects.map((subject): [string, BaseNode] => [subject.id, subject]),
    ]),
    input: {
      annotationId: input.annotationId,
      body: input.body,
      contextRecords: collectContextRecords(contextNodesById),
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

export async function findReusableAnnotationCard(input: {
  annotationCards: AnnotationCardsSnapshot;
  body: string;
  contextFrameId: string;
}): Promise<ReusableAnnotationCard | null> {
  if (input.annotationCards.container === null) {
    return null;
  }

  const normalizedBody = input.body.trim();
  const candidates = input.annotationCards.cards.flatMap(({ node, record }) =>
    record !== null && record.body.trim() === normalizedBody ? [{ node, record }] : [],
  );
  const subjectNodesById = await getSeedSubjectNodes(
    candidates
      .filter(({ record }) => record.contextFrameId !== input.contextFrameId)
      .flatMap(({ record }) => record.subjectNodeIds),
  );
  const reusable = candidates
    .flatMap(({ node, record }) => {
      if (!isAnnotationInEffectiveContext(record, input.contextFrameId, subjectNodesById)) {
        return [];
      }

      return [{ node, record }];
    })
    .sort(
      (first, second) =>
        first.record.annotationNumber - second.record.annotationNumber ||
        first.record.id.localeCompare(second.record.id),
    )[0];

  return reusable === undefined
    ? null
    : {
        existingBadgeSubjectNodeIds: getBadgeSubjectNodeIds(
          input.annotationCards.container,
          reusable.record.id,
        ),
        node: reusable.node,
        record: reusable.record,
      };
}

function collectAnnotationContextNodes(subjects: SceneNode[]): Map<string, FrameNode | PageNode> {
  const contextNodes = new Map<string, FrameNode | PageNode>([
    [figma.currentPage.id, figma.currentPage],
  ]);
  subjects.forEach((subject) => {
    const contextFrame = getTopLevelFrameAncestor(subject);
    if (contextFrame !== null) {
      contextNodes.set(contextFrame.id, contextFrame);
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

function collectAnnotationCardsSnapshot(container: FrameNode | null): AnnotationCardsSnapshot {
  if (container === null) {
    return { cards: [], container };
  }

  const cards = container.children.flatMap((node) => {
    if (!isAnnotationCardNode(node)) {
      return [];
    }

    const value = node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotation);
    const seed = decodeAnnotationNumberSeedRecord(value);
    const record = decodeAnnotationRecord(value);
    return seed === null ? [] : [{ node, record, seed }];
  });

  return { cards, container };
}

export async function collectAnnotationNumberSeedsForContext(
  annotationCards: AnnotationCardsSnapshot,
  contextFrameId: string,
): Promise<AnnotationNumberSeedRecord[]> {
  const recordsNeedingContextRecovery = annotationCards.cards.flatMap(({ record }) =>
    record !== null && record.contextFrameId !== contextFrameId ? [record] : [],
  );
  const subjectNodesById = await getSeedSubjectNodes(
    recordsNeedingContextRecovery.flatMap((record) => record.subjectNodeIds),
  );

  return [
    ...annotationCards.cards.map(({ seed }) => seed),
    ...recordsNeedingContextRecovery.flatMap((record) => {
      return record.subjectNodeIds.flatMap((subjectNodeId) => {
        const subjectNode = subjectNodesById.get(subjectNodeId);
        if (
          subjectNode === undefined ||
          getEffectiveAnnotationContextId(subjectNode) !== contextFrameId
        ) {
          return [];
        }
        return [{ annotationNumber: record.annotationNumber, contextFrameId }];
      });
    }),
  ];
}

function toCreateAnnotationAuthoringSubject(subject: SceneNode) {
  return {
    ...toAnnotationSubjectInput(subject),
    ancestorFrameIds: getTopLevelFrameAncestorIds(subject),
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

function getTopLevelFrameAncestorIds(node: SceneNode): string[] {
  const frame = getTopLevelFrameAncestor(node);
  return frame === null ? [] : [frame.id];
}

function getEffectiveAnnotationContextId(node: SceneNode): string {
  return getTopLevelFrameAncestor(node)?.id ?? figma.currentPage.id;
}

function getTopLevelFrameAncestor(node: SceneNode): FrameNode | null {
  let topLevelFrame: FrameNode | null = null;
  let current: BaseNode | null = node;
  while (current !== null && current.type !== "PAGE") {
    if (current.type === "FRAME") {
      topLevelFrame = current;
    }
    current = current.parent;
  }
  return topLevelFrame;
}

async function getSeedSubjectNodes(subjectNodeIds: string[]): Promise<Map<string, SceneNode>> {
  const nodes = await getExistingSceneNodesById(subjectNodeIds);
  return new Map(nodes.map((node) => [node.id, node]));
}

function isAnnotationInEffectiveContext(
  record: AnnotationRecord,
  contextFrameId: string,
  subjectNodesById: Map<string, SceneNode>,
): boolean {
  if (record.contextFrameId === contextFrameId) {
    return true;
  }

  return record.subjectNodeIds.some((subjectNodeId) => {
    const subject = subjectNodesById.get(subjectNodeId);
    return subject !== undefined && getEffectiveAnnotationContextId(subject) === contextFrameId;
  });
}
