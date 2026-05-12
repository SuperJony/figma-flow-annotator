import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createFigmaStub,
  createNode,
  createPage,
  flushPluginMessage,
  importCodeModule,
  namespace,
  readAnnotationRefs,
  setBadgeRecord,
  setCardRecord,
} from "../support/plugin-test-helpers.mjs";

test("adds Subject Nodes when a selected Annotation Card descendant is selected", async () => {
  const page = createPage();
  const subjectA = createNode(page, "subject-a", 0);
  const subjectB = createNode(page, "subject-b", 180);
  const annotationsContainer = createNode(page, "FFA Annotations", 800);
  const existingCard = createNode(annotationsContainer, "FFA Annotation Card #4", 820);
  const cardBodyText = createNode(existingCard, "annotation-card-body", 840);
  const existingBadge = createNode(annotationsContainer, "FFA Annotation Badge #4", 850);
  const messages = [];

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  setCardRecord(existingCard, 4, page.id);
  setBadgeRecord(existingBadge, 4, subjectA.id, page.id);
  subjectA.setSharedPluginData(
    namespace,
    "annotationRefs",
    JSON.stringify({
      schemaVersion: 1,
      annotationIds: ["annotation-4"],
    }),
  );

  annotationsContainer.children = [existingCard, existingBadge];
  existingCard.children = [cardBodyText];
  page.children = [subjectA, subjectB, annotationsContainer];
  page.selection = [cardBodyText, subjectB];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  const selectionState = messages.find((message) => message.type === "selection-state");
  assert.equal(selectionState.selectedAnnotationCardCount, 1);
  assert.equal(selectionState.eligibleCount, 1);

  globalThis.figma.ui.onmessage({ type: "add-subject-nodes" });
  await flushPluginMessage(messages);

  const updatedRecord = JSON.parse(existingCard.getSharedPluginData(namespace, "annotation"));
  const badges = annotationsContainer.children.filter(
    (child) => child.getSharedPluginData(namespace, "kind") === "annotation-badge",
  );
  const subjectBBadge = badges.find((badge) => {
    const ref = JSON.parse(badge.getSharedPluginData(namespace, "badgeRef"));
    return ref.subjectNodeId === "subject-b";
  });
  const status = messages.find(
    (message) => message.type === "status" && message.tone === "success",
  );

  assert.deepEqual(updatedRecord.subjectNodeIds, ["subject-a", "subject-b"]);
  assert.equal(updatedRecord.annotationNumber, 4);
  assert.equal(badges.length, 2);
  assert.ok(subjectBBadge);
  assert.deepEqual(readAnnotationRefs(subjectB), ["annotation-4"]);
  assert.equal(status.message, "Added 1 subject node(s) to annotation #4 with 1 new badge(s).");
});
