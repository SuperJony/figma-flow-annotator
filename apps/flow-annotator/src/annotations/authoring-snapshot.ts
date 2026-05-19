import {
  type AnnotationNumberSeedRecord,
  type AnnotationRecord,
  type BuildAddAnnotationSubjectsOperationBatchInput,
  decodeAnnotationNumberSeedRecord,
  decodeAnnotationRecord,
  decodeContextRecord,
  type ExistingAnnotationCardAuthoringInput,
  type PlanAnnotationAuthoringInput,
  SHARED_PLUGIN_DATA,
  selectAnnotationContextFrameId,
} from "@figma-flow-annotator/core";
import {
  getExistingSceneNodesById,
  getVisibleBounds,
  hasGeneratedAncestor,
  NAMESPACE,
  readReferenceIds,
} from "../figma/runtime";
import {
  getBadgeSubjectNodeIds,
  getBadgeSubjectNodeIdsByAnnotationId,
  isAnnotationCardNode,
} from "./records";

type CreateAnnotationAuthoringInput = Omit<PlanAnnotationAuthoringInput, "createAnnotationId">;

interface CreateAnnotationAuthoringSnapshot {
  annotationCardNodesById: Map<string, FrameNode>;
  existingNodesById: Map<string, BaseNode>;
  input: CreateAnnotationAuthoringInput;
}

interface AddAnnotationSubjectsAuthoringSnapshot {
  existingNodesById: Map<string, BaseNode>;
  input: BuildAddAnnotationSubjectsOperationBatchInput;
}

interface AnnotationCardsSnapshot {
  cards: ExistingAnnotationCardAuthoringInput[];
  nodesById: Map<string, FrameNode>;
}

interface RawAnnotationCardAuthoringSnapshot {
  node: FrameNode;
  record: AnnotationRecord | null;
  seed: AnnotationNumberSeedRecord;
}

export async function collectCreateAnnotationAuthoringSnapshot(input: {
  body: string;
  now: string;
}): Promise<CreateAnnotationAuthoringSnapshot> {
  const subjects = figma.currentPage.selection.filter((node) => !hasGeneratedAncestor(node));
  const authoringSubjects = subjects.map(toCreateAnnotationAuthoringSubject);
  const contextFrameId = selectAnnotationContextFrameId({
    pageId: figma.currentPage.id,
    subjects: authoringSubjects,
  });
  const contextNodesById = collectAnnotationContextNodes(subjects);
  const annotationCards = await collectAnnotationCardsSnapshot(figma.currentPage, contextFrameId);

  return {
    annotationCardNodesById: annotationCards.nodesById,
    existingNodesById: new Map([
      ...contextNodesById,
      ...subjects.map((subject): [string, BaseNode] => [subject.id, subject]),
    ]),
    input: {
      body: input.body,
      contexts: collectAnnotationContexts(contextNodesById, contextFrameId),
      existingAnnotationCards: annotationCards.cards,
      now: input.now,
      pageId: figma.currentPage.id,
      subjects: authoringSubjects,
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

  return {
    existingNodesById: new Map([
      [input.annotationCard.id, input.annotationCard],
      ...subjects.map((subject): [string, BaseNode] => [subject.id, subject]),
    ]),
    input: {
      annotation: input.annotation,
      annotationCardNodeId: input.annotationCard.id,
      existingBadgeSubjectNodeIds: getBadgeSubjectNodeIds(figma.currentPage, input.annotation.id),
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
    const contextFrame = getTopLevelFrameAncestor(subject);
    if (contextFrame !== null) {
      contextNodes.set(contextFrame.id, contextFrame);
    }
  });
  return contextNodes;
}

function collectAnnotationContexts(
  contextNodes: Map<string, FrameNode | PageNode>,
  contextFrameId: string,
) {
  const node = contextNodes.get(contextFrameId);
  if (node === undefined) {
    return [];
  }

  const record = decodeContextRecord(
    node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.context),
    node.id,
  );
  return [
    {
      bounds: node.type === "PAGE" ? null : getVisibleBounds(node),
      id: node.id,
      record,
    },
  ];
}

async function collectAnnotationCardsSnapshot(
  parent: PageNode,
  contextFrameId: string,
): Promise<AnnotationCardsSnapshot> {
  const badgeSubjectNodeIdsByAnnotationId = getBadgeSubjectNodeIdsByAnnotationId(parent);
  const rawCards = collectRawAnnotationCards(parent);
  const subjectNodesById = await getSeedSubjectNodes(
    rawCards.flatMap(({ record }) =>
      record !== null && record.contextFrameId !== contextFrameId ? record.subjectNodeIds : [],
    ),
  );
  const cards: ExistingAnnotationCardAuthoringInput[] = rawCards.map(({ node, record, seed }) => ({
    annotationCardNodeId: node.id,
    existingBadgeSubjectNodeIds:
      record === null ? [] : (badgeSubjectNodeIdsByAnnotationId.get(record.id) ?? []),
    record,
    seed,
    subjectAncestorFrameIds:
      record === null
        ? []
        : record.subjectNodeIds.flatMap((subjectNodeId) => {
            const subject = subjectNodesById.get(subjectNodeId);
            return subject === undefined ? [] : [getTopLevelFrameAncestorIds(subject)];
          }),
  }));

  return {
    cards,
    nodesById: new Map(rawCards.map(({ node }) => [node.id, node])),
  };
}

function collectRawAnnotationCards(parent: PageNode): RawAnnotationCardAuthoringSnapshot[] {
  return parent.children.flatMap((node) => {
    if (!isAnnotationCardNode(node)) {
      return [];
    }

    const value = node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotation);
    const seed = decodeAnnotationNumberSeedRecord(value);
    const record = decodeAnnotationRecord(value);
    return seed === null ? [] : [{ node, record, seed }];
  });
}

async function getSeedSubjectNodes(subjectNodeIds: string[]): Promise<Map<string, SceneNode>> {
  const nodes = await getExistingSceneNodesById(subjectNodeIds);
  return new Map(nodes.map((node) => [node.id, node]));
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
