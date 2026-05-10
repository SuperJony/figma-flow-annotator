import {
  type AnnotationRecord,
  type AnnotationValidationBadgeInput,
  type AnnotationValidationCardInput,
  type BadgeRefRecord,
  decodeAnnotationRecord,
  decodeAnnotationValidationRecord,
  decodeBadgeRefRecord,
  SHARED_PLUGIN_DATA,
  VISUAL_NODE_KINDS,
} from "@figma-flow-annotator/core";
import { NAMESPACE } from "../figma/runtime";

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
  const record = decodeAnnotationRecord(
    node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotation),
  );
  if (record === null) {
    throw new Error("Selected Annotation Card does not contain a complete Annotation record.");
  }
  return record;
}

export function readBadgeRefRecord(node: BaseNode): BadgeRefRecord | null {
  return decodeBadgeRefRecord(
    node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.badgeRef),
  );
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

function readAnnotationValidationRecord(node: BaseNode) {
  return decodeAnnotationValidationRecord(
    node.getSharedPluginData(NAMESPACE, SHARED_PLUGIN_DATA.keys.annotation),
  );
}
