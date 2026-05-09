import {
  type AnnotationRecord,
  type AnnotationValidationBadgeInput,
  type AnnotationValidationCardInput,
  type AnnotationValidationRecord,
  type BadgeRefRecord,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import { isPositiveInteger, isRecord, NAMESPACE, parseJson } from "../figma/runtime";

export function getSelectedAnnotationCard(): FrameNode {
  const selectedCards = figma.currentPage.selection.filter(isAnnotationCardNode);
  if (selectedCards.length !== 1) {
    throw new Error("Select exactly one Annotation Card root and one or more Subject Nodes.");
  }
  return selectedCards[0];
}

export function isAnnotationCardNode(node: SceneNode): node is FrameNode {
  return (
    node.type === "FRAME" &&
    node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) ===
      VISUAL_NODE_KINDS.annotationCard
  );
}

export function readAnnotationRecord(node: BaseNode): AnnotationRecord {
  const parsed = parseJson(node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotation));
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.id !== "string" ||
    !isPositiveInteger(parsed.annotationNumber) ||
    typeof parsed.body !== "string" ||
    parsed.body.trim().length === 0 ||
    typeof parsed.contextFrameId !== "string" ||
    !Array.isArray(parsed.subjectNodeIds) ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string"
  ) {
    throw new Error("Selected Annotation Card does not contain a complete Annotation record.");
  }

  return {
    schemaVersion: 1,
    id: parsed.id,
    annotationNumber: parsed.annotationNumber,
    ...(typeof parsed.title === "string" ? { title: parsed.title } : {}),
    body: parsed.body,
    ...(typeof parsed.kind === "string" ? { kind: parsed.kind } : {}),
    contextFrameId: parsed.contextFrameId,
    subjectNodeIds: parsed.subjectNodeIds.filter(
      (value): value is string => typeof value === "string",
    ),
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
}

export function readBadgeRefRecord(node: BaseNode): BadgeRefRecord | null {
  const parsed = parseJson(node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.badgeRef));
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.annotationId !== "string" ||
    !isPositiveInteger(parsed.annotationNumber) ||
    typeof parsed.subjectNodeId !== "string" ||
    typeof parsed.contextFrameId !== "string"
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

export function getAnnotationBadgeRecords(
  container: FrameNode,
): { node: FrameNode; record: BadgeRefRecord }[] {
  return container.children.flatMap((child) => {
    if (
      child.type !== "FRAME" ||
      child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) !==
        VISUAL_NODE_KINDS.annotationBadge
    ) {
      return [];
    }

    const record = readBadgeRefRecord(child);
    return record === null ? [] : [{ node: child, record }];
  });
}

export function getBadgeSubjectNodeIds(container: FrameNode, annotationId: string): string[] {
  return getAnnotationBadgeRecords(container)
    .filter((badge) => badge.record.annotationId === annotationId)
    .map((badge) => badge.record.subjectNodeId);
}

export function getAnnotationCardRecords(
  container: FrameNode,
): { node: FrameNode; record: AnnotationRecord }[] {
  return container.children.flatMap((child) => {
    if (!isAnnotationCardNode(child)) {
      return [];
    }
    return [{ node: child, record: readAnnotationRecord(child) }];
  });
}

export function getAnnotationValidationCards(
  container: FrameNode,
): AnnotationValidationCardInput[] {
  return container.children.flatMap((child) => {
    if (!isAnnotationCardNode(child) || child.absoluteBoundingBox === null) {
      return [];
    }
    const record = readAnnotationValidationRecord(child);
    return record === null
      ? []
      : [
          {
            nodeId: child.id,
            record,
            rect: child.absoluteBoundingBox,
          },
        ];
  });
}

export function getAnnotationValidationBadges(
  container: FrameNode,
): AnnotationValidationBadgeInput[] {
  return container.children.flatMap((child) => {
    if (
      child.type !== "FRAME" ||
      child.absoluteBoundingBox === null ||
      child.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.kind) !==
        VISUAL_NODE_KINDS.annotationBadge
    ) {
      return [];
    }
    const record = readBadgeRefRecord(child);
    return record === null
      ? []
      : [
          {
            nodeId: child.id,
            record,
            rect: child.absoluteBoundingBox,
          },
        ];
  });
}

function readAnnotationValidationRecord(node: BaseNode): AnnotationValidationRecord | null {
  const parsed = parseJson(node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotation));
  if (
    !isRecord(parsed) ||
    typeof parsed.id !== "string" ||
    !isPositiveInteger(parsed.annotationNumber) ||
    typeof parsed.body !== "string" ||
    typeof parsed.contextFrameId !== "string" ||
    !Array.isArray(parsed.subjectNodeIds)
  ) {
    return null;
  }

  return {
    id: parsed.id,
    annotationNumber: parsed.annotationNumber,
    body: parsed.body,
    contextFrameId: parsed.contextFrameId,
    subjectNodeIds: parsed.subjectNodeIds.filter(
      (value): value is string => typeof value === "string",
    ),
  };
}
