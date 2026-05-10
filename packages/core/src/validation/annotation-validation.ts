import { ANNOTATION_CARD_LAYOUT, getAnnotationBadgePosition } from "../visual-model.ts";
import {
  addIssue,
  arraysEqual,
  compareAnnotationNumbersThenIds,
  compareRectsThenIds,
  countUnique,
  groupBy,
  summarizeValidationIssues,
} from "./report.ts";
import type {
  ValidateAnnotationBindingsInput,
  ValidationIssue,
  ValidationReport,
} from "./types.ts";

const VALIDATION_LAYOUT_TOLERANCE = 1;

export function validateAnnotationBindings(
  input: ValidateAnnotationBindingsInput,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const cardsByAnnotationId = new Map(input.cards.map((card) => [card.record.id, card]));
  const subjectsById = new Map(input.subjects.map((subject) => [subject.nodeId, subject]));
  const contextsById = new Map(input.contexts.map((context) => [context.nodeId, context]));

  const missingBadgeTargets: string[] = [];
  const missingBadgeSubjectIds: string[] = [];
  input.cards.forEach((card) => {
    card.record.subjectNodeIds.forEach((subjectNodeId) => {
      if (!subjectsById.has(subjectNodeId)) {
        return;
      }
      const hasBadge = input.badges.some(
        (badge) =>
          badge.record.annotationId === card.record.id &&
          badge.record.subjectNodeId === subjectNodeId,
      );
      if (!hasBadge) {
        missingBadgeTargets.push(card.nodeId, subjectNodeId);
        missingBadgeSubjectIds.push(subjectNodeId);
      }
    });
  });
  addIssue(issues, {
    code: "annotation-missing-badge",
    severity: "warning",
    title: "Missing Annotation Badge",
    affectedObjectCount: countUnique(missingBadgeSubjectIds),
    description: "Some bound Subject Nodes do not have a matching Annotation Badge.",
    locationNodeIds: missingBadgeTargets,
  });

  const duplicateBadgeTargets: string[] = [];
  groupBy(
    input.badges,
    (badge) => `${badge.record.annotationId}\u0000${badge.record.subjectNodeId}`,
  ).forEach((badges) => {
    if (badges.length <= 1) {
      return;
    }
    duplicateBadgeTargets.push(
      ...badges.map((badge) => badge.nodeId),
      badges[0].record.subjectNodeId,
    );
  });
  addIssue(issues, {
    code: "annotation-duplicate-badge",
    severity: "warning",
    title: "Duplicate Annotation Badge",
    affectedObjectCount: duplicateBadgeTargets.length,
    description: "A Subject Node has more than one Annotation Badge for the same Annotation.",
    locationNodeIds: duplicateBadgeTargets,
  });

  const orphanTargets: string[] = [];
  input.cards.forEach((card) => {
    const contextExists = contextsById.has(card.record.contextFrameId);
    const liveSubjectCount = card.record.subjectNodeIds.filter((subjectNodeId) =>
      subjectsById.has(subjectNodeId),
    ).length;
    if (!contextExists || card.record.subjectNodeIds.length === 0 || liveSubjectCount === 0) {
      orphanTargets.push(
        card.nodeId,
        ...card.record.subjectNodeIds.filter((subjectNodeId) => subjectsById.has(subjectNodeId)),
      );
    }
  });
  input.subjects.forEach((subject) => {
    subject.annotationIds.forEach((annotationId) => {
      if (!cardsByAnnotationId.has(annotationId)) {
        orphanTargets.push(subject.nodeId);
      }
    });
  });
  addIssue(issues, {
    code: "annotation-orphaned",
    severity: "error",
    title: "Orphaned Annotation",
    affectedObjectCount: countUnique(orphanTargets),
    description: "An Annotation is missing its required card, context, or all live Subject Nodes.",
    locationNodeIds: orphanTargets,
  });

  const missingBodyTargets = input.cards
    .filter((card) => card.record.body.trim().length === 0)
    .map((card) => card.nodeId);
  addIssue(issues, {
    code: "annotation-missing-body",
    severity: "error",
    title: "Missing Required Annotation Body",
    affectedObjectCount: missingBodyTargets.length,
    description: "An Annotation Card has an empty required Annotation Body.",
    locationNodeIds: missingBodyTargets,
  });

  const outsideTargets = input.cards
    .filter((card) => {
      const context = contextsById.get(card.record.contextFrameId);
      if (context?.rect === undefined) {
        return false;
      }
      const minY = context.rect.y + context.rect.height + ANNOTATION_CARD_LAYOUT.offsetY;
      return (
        card.rect.y < minY - VALIDATION_LAYOUT_TOLERANCE ||
        card.rect.x < context.rect.x - VALIDATION_LAYOUT_TOLERANCE ||
        card.rect.x > context.rect.x + context.rect.width + VALIDATION_LAYOUT_TOLERANCE
      );
    })
    .map((card) => card.nodeId);
  addIssue(issues, {
    code: "annotation-card-outside-design-notes-area",
    severity: "warning",
    title: "Annotation Card Outside Design Notes Area",
    affectedObjectCount: outsideTargets.length,
    description:
      "An Annotation Card is not placed below its Context Frame in the Design Notes Area.",
    locationNodeIds: outsideTargets,
  });

  const unsortedCardTargets: string[] = [];
  groupBy(input.cards, (card) => card.record.contextFrameId).forEach((cards) => {
    const visualOrder = [...cards].sort(compareRectsThenIds).map((card) => card.nodeId);
    const numberOrder = [...cards]
      .sort((first, second) =>
        compareAnnotationNumbersThenIds(
          { annotationNumber: first.record.annotationNumber, nodeId: first.nodeId },
          { annotationNumber: second.record.annotationNumber, nodeId: second.nodeId },
        ),
      )
      .map((card) => card.nodeId);
    if (!arraysEqual(visualOrder, numberOrder)) {
      unsortedCardTargets.push(...cards.map((card) => card.nodeId));
    }
  });
  addIssue(issues, {
    code: "annotation-cards-unsorted",
    severity: "info",
    title: "Unsorted Annotation Cards",
    affectedObjectCount: countUnique(unsortedCardTargets),
    description: "Annotation Cards are not visually sorted by Annotation Number.",
    locationNodeIds: unsortedCardTargets,
  });

  const unarrangedBadgeTargets: string[] = [];
  groupBy(input.badges, (badge) => badge.record.subjectNodeId).forEach((badges, subjectNodeId) => {
    const subject = subjectsById.get(subjectNodeId);
    const subjectRect = subject?.rect;
    if (subjectRect === undefined || badges.length <= 1) {
      return;
    }
    const arrangedOrder = [...badges].sort((first, second) =>
      compareAnnotationNumbersThenIds(
        { annotationNumber: first.record.annotationNumber, nodeId: first.nodeId },
        { annotationNumber: second.record.annotationNumber, nodeId: second.nodeId },
      ),
    );
    arrangedOrder.forEach((badge, index) => {
      const expectedPosition = getAnnotationBadgePosition({
        badgeIndex: index,
        subjectBounds: subjectRect,
      });
      if (
        Math.abs(badge.rect.x - expectedPosition.x) > VALIDATION_LAYOUT_TOLERANCE ||
        Math.abs(badge.rect.y - expectedPosition.y) > VALIDATION_LAYOUT_TOLERANCE
      ) {
        unarrangedBadgeTargets.push(badge.nodeId, subjectNodeId);
      }
    });
  });
  addIssue(issues, {
    code: "annotation-badges-unarranged",
    severity: "info",
    title: "Unarranged Annotation Badges",
    affectedObjectCount: countUnique(unarrangedBadgeTargets),
    description: "Annotation Badges beside a Subject Node are not arranged by Annotation Number.",
    locationNodeIds: unarrangedBadgeTargets,
  });

  return {
    schemaVersion: 1,
    issues,
    summary: summarizeValidationIssues(issues),
  };
}
