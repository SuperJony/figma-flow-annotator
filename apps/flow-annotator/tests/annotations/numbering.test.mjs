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

test("creates an Annotation without scanning unrelated frame descendants for numbering", async () => {
  const page = createPage();
  const subjectA = createNode(page, "subject-a", 0);
  const subjectB = createNode(page, "subject-b", 180);
  const unrelatedFrame = createNode(page, "unrelated-frame", 480);
  const nestedChild = createNode(unrelatedFrame, "nested-child", 520);
  const annotationsContainer = createNode(page, "FFA Annotations", 800);
  const existingCard = createNode(annotationsContainer, "FFA Annotation Card #4", 820);
  const messages = [];

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  existingCard.setSharedPluginData(namespace, "kind", "annotation-card");
  existingCard.setSharedPluginData(
    namespace,
    "annotation",
    JSON.stringify({
      schemaVersion: 1,
      id: "annotation-existing",
      annotationNumber: 4,
      body: "Existing note",
      contextFrameId: page.id,
      subjectNodeIds: ["old-subject"],
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    }),
  );

  nestedChild.getSharedPluginData = () => {
    throw new Error("Annotation numbering must not scan unrelated frame descendants.");
  };
  unrelatedFrame.children = [nestedChild];
  annotationsContainer.children = [existingCard];
  page.children = [subjectA, subjectB, unrelatedFrame, annotationsContainer];
  page.selection = [subjectA, subjectB];
  globalThis.figma = createFigmaStub(page, messages);
  const getNodeByIdAsync = globalThis.figma.getNodeByIdAsync;
  globalThis.figma.getNodeByIdAsync = async (id) => {
    if (id === "old-subject") {
      throw new Error("Same-context Annotation subjects must not be hydrated for numbering.");
    }
    return getNodeByIdAsync(id);
  };

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "create-annotation", body: "New note" });
  await flushPluginMessage(messages);

  const createdCard = annotationsContainer.children.find(
    (child) =>
      child.getSharedPluginData(namespace, "kind") === "annotation-card" && child !== existingCard,
  );
  const createdRecord = JSON.parse(createdCard.getSharedPluginData(namespace, "annotation"));
  const createdBadges = annotationsContainer.children.filter(
    (child) => child.getSharedPluginData(namespace, "kind") === "annotation-badge",
  );
  const contextRecord = JSON.parse(page.getSharedPluginData(namespace, "context"));
  const status = messages.find(
    (message) => message.type === "status" && message.tone === "success",
  );

  assert.ok(createdCard);
  assert.equal(createdCard.name, "FFA Annotation Card #5");
  assert.equal(createdRecord.schemaVersion, 1);
  assert.equal(createdRecord.annotationNumber, 5);
  assert.deepEqual(createdRecord.subjectNodeIds, ["subject-a", "subject-b"]);
  assert.equal(createdBadges.length, 2);
  assert.deepEqual(readAnnotationRefs(subjectA), [createdRecord.id]);
  assert.deepEqual(readAnnotationRefs(subjectB), [createdRecord.id]);
  assert.equal(contextRecord.nextAnnotationNumber, 6);
  assert.equal(status.message, "Created annotation #5 with 2 badge(s).");
});

test("creates an Annotation in the shared Context Frame with existing subject ref offsets", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "context-frame", 0);
  const subjectA = createNode(contextFrame, "subject-a", 20);
  const subjectB = createNode(contextFrame, "subject-b", 180);
  const annotationsContainer = createNode(page, "FFA Annotations", 800);
  const messages = [];

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  contextFrame.setSharedPluginData(
    namespace,
    "context",
    JSON.stringify({
      schemaVersion: 1,
      contextFrameId: contextFrame.id,
      nextAnnotationNumber: 9,
    }),
  );
  subjectA.setSharedPluginData(
    namespace,
    "annotationRefs",
    JSON.stringify({
      schemaVersion: 1,
      annotationIds: ["annotation-existing-a", "annotation-existing-b"],
    }),
  );

  contextFrame.children = [subjectA, subjectB];
  page.children = [contextFrame, annotationsContainer];
  page.selection = [subjectA, subjectB];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "create-annotation", body: "Context note" });
  await flushPluginMessage(messages);

  const createdCard = annotationsContainer.children.find(
    (child) => child.getSharedPluginData(namespace, "kind") === "annotation-card",
  );
  const createdRecord = JSON.parse(createdCard.getSharedPluginData(namespace, "annotation"));
  const createdBadges = annotationsContainer.children.filter(
    (child) => child.getSharedPluginData(namespace, "kind") === "annotation-badge",
  );
  const subjectABadge = createdBadges.find((badge) => {
    const ref = JSON.parse(badge.getSharedPluginData(namespace, "badgeRef"));
    return ref.subjectNodeId === subjectA.id;
  });
  const subjectBBadge = createdBadges.find((badge) => {
    const ref = JSON.parse(badge.getSharedPluginData(namespace, "badgeRef"));
    return ref.subjectNodeId === subjectB.id;
  });
  const contextRecord = JSON.parse(contextFrame.getSharedPluginData(namespace, "context"));

  assert.equal(createdRecord.annotationNumber, 9);
  assert.equal(createdRecord.contextFrameId, contextFrame.id);
  assert.deepEqual(createdRecord.subjectNodeIds, ["subject-a", "subject-b"]);
  assert.equal(createdCard.name, "FFA Annotation Card #9");
  assert.equal(createdBadges.length, 2);
  assert.equal(subjectABadge.x, 170);
  assert.equal(subjectABadge.y, -14);
  assert.equal(subjectBBadge.x, 266);
  assert.equal(subjectBBadge.y, -14);
  assert.deepEqual(readAnnotationRefs(subjectA), [
    "annotation-existing-a",
    "annotation-existing-b",
    createdRecord.id,
  ]);
  assert.deepEqual(readAnnotationRefs(subjectB), [createdRecord.id]);
  assert.equal(contextRecord.nextAnnotationNumber, 10);
});

test("increments Annotation Numbers for separate child-frame annotations in one Context Frame", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "context-frame", 0);
  const subjectA = createNode(contextFrame, "subject-a", 20);
  const subjectB = createNode(contextFrame, "subject-b", 180);
  const annotationsContainer = createNode(page, "FFA Annotations", 800);
  const messages = [];

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  contextFrame.children = [subjectA, subjectB];
  page.children = [contextFrame, annotationsContainer];
  page.selection = [subjectA];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "create-annotation", body: "First note" });
  await flushPluginMessage(messages);

  messages.length = 0;
  page.selection = [subjectB];
  globalThis.figma.ui.onmessage({ type: "create-annotation", body: "Second note" });
  await flushPluginMessage(messages);

  const createdRecords = annotationsContainer.children
    .filter((child) => child.getSharedPluginData(namespace, "kind") === "annotation-card")
    .map((card) => JSON.parse(card.getSharedPluginData(namespace, "annotation")));
  const secondRecord = createdRecords.find((record) => record.subjectNodeIds.includes(subjectB.id));
  const contextRecord = JSON.parse(contextFrame.getSharedPluginData(namespace, "context"));
  const status = messages.find(
    (message) => message.type === "status" && message.tone === "success",
  );

  assert.deepEqual(
    createdRecords.map((record) => record.annotationNumber),
    [1, 2],
  );
  assert.equal(secondRecord.contextFrameId, contextFrame.id);
  assert.equal(contextRecord.nextAnnotationNumber, 3);
  assert.equal(status.message, "Created annotation #2 with 1 badge(s).");
});

test("numbers nested-frame annotations from the top-level Context Frame and legacy card seeds", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "group-chat-screen", 0);
  const head = createNode(contextFrame, "head", 20);
  const existingSubject = createNode(head, "existing-subject", 40);
  const inputGroup = createNode(contextFrame, "input-group", 180);
  const newSubject = createNode(inputGroup, "new-subject", 220);
  const annotationsContainer = createNode(page, "FFA Annotations", 800);
  const legacyInnerContextCard = createNode(annotationsContainer, "FFA Annotation Card #1", 820);
  const legacyPageContextCard = createNode(annotationsContainer, "FFA Annotation Card #2", 860);
  const messages = [];

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  legacyInnerContextCard.setSharedPluginData(namespace, "kind", "annotation-card");
  legacyInnerContextCard.setSharedPluginData(
    namespace,
    "annotation",
    JSON.stringify({
      schemaVersion: 1,
      id: "annotation-legacy-inner-context",
      annotationNumber: 1,
      body: "legacy inner context body",
      contextFrameId: head.id,
      subjectNodeIds: [existingSubject.id],
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    }),
  );
  legacyPageContextCard.setSharedPluginData(namespace, "kind", "annotation-card");
  legacyPageContextCard.setSharedPluginData(
    namespace,
    "annotation",
    JSON.stringify({
      schemaVersion: 1,
      id: "annotation-legacy-page-context",
      annotationNumber: 2,
      body: "legacy page context body",
      contextFrameId: page.id,
      subjectNodeIds: [contextFrame.id],
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    }),
  );

  head.children = [existingSubject];
  inputGroup.children = [newSubject];
  contextFrame.children = [head, inputGroup];
  annotationsContainer.children = [legacyInnerContextCard, legacyPageContextCard];
  page.children = [contextFrame, annotationsContainer];
  page.selection = [newSubject];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "create-annotation", body: "New nested note" });
  await flushPluginMessage(messages);

  const createdCards = annotationsContainer.children.filter(
    (child) =>
      child.getSharedPluginData(namespace, "kind") === "annotation-card" &&
      child !== legacyInnerContextCard &&
      child !== legacyPageContextCard,
  );
  const createdRecord = JSON.parse(createdCards[0].getSharedPluginData(namespace, "annotation"));
  const contextRecord = JSON.parse(contextFrame.getSharedPluginData(namespace, "context"));
  const status = messages.find(
    (message) => message.type === "status" && message.tone === "success",
  );

  assert.equal(createdRecord.annotationNumber, 3);
  assert.equal(createdRecord.contextFrameId, contextFrame.id);
  assert.deepEqual(createdRecord.subjectNodeIds, [newSubject.id]);
  assert.equal(contextRecord.nextAnnotationNumber, 4);
  assert.equal(status.message, "Created annotation #3 with 1 badge(s).");
});

test("reuses a matching Annotation Body in the same top-level Context Frame", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "group-chat-screen", 0);
  const subjectA = createNode(contextFrame, "subject-a", 20);
  const subjectB = createNode(contextFrame, "subject-b", 180);
  const annotationsContainer = createNode(page, "FFA Annotations", 800);
  const messages = [];

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  contextFrame.children = [subjectA, subjectB];
  page.children = [contextFrame, annotationsContainer];
  page.selection = [subjectA];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "create-annotation", body: "Shared note" });
  await flushPluginMessage(messages);

  messages.length = 0;
  page.selection = [subjectB];
  globalThis.figma.ui.onmessage({ type: "create-annotation", body: "Shared note" });
  await flushPluginMessage(messages);

  const cards = annotationsContainer.children.filter(
    (child) => child.getSharedPluginData(namespace, "kind") === "annotation-card",
  );
  const badges = annotationsContainer.children.filter(
    (child) => child.getSharedPluginData(namespace, "kind") === "annotation-badge",
  );
  const updatedRecord = JSON.parse(cards[0].getSharedPluginData(namespace, "annotation"));
  const status = messages.find(
    (message) => message.type === "status" && message.tone === "success",
  );

  assert.equal(cards.length, 1);
  assert.equal(badges.length, 2);
  assert.equal(updatedRecord.annotationNumber, 1);
  assert.deepEqual(updatedRecord.subjectNodeIds, [subjectA.id, subjectB.id]);
  assert.deepEqual(readAnnotationRefs(subjectA), [updatedRecord.id]);
  assert.deepEqual(readAnnotationRefs(subjectB), [updatedRecord.id]);
  assert.equal(status.message, "Updated annotation #1 with 1 new badge(s).");
});

test("serializes repeated Annotation creation messages before snapshotting", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "group-chat-screen", 0);
  const subject = createNode(contextFrame, "subject-a", 20);
  const annotationsContainer = createNode(page, "FFA Annotations", 800);
  const messages = [];

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  contextFrame.children = [subject];
  page.children = [contextFrame, annotationsContainer];
  page.selection = [subject];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "create-annotation", body: "Shared note" });
  globalThis.figma.ui.onmessage({ type: "create-annotation", body: "Shared note" });
  await flushStatusCount(messages, 2);

  const cards = annotationsContainer.children.filter(
    (child) => child.getSharedPluginData(namespace, "kind") === "annotation-card",
  );
  const badges = annotationsContainer.children.filter(
    (child) => child.getSharedPluginData(namespace, "kind") === "annotation-badge",
  );
  const statuses = messages.filter((message) => message.type === "status");
  const record = JSON.parse(cards[0].getSharedPluginData(namespace, "annotation"));

  assert.equal(cards.length, 1);
  assert.equal(badges.length, 1);
  assert.equal(record.annotationNumber, 1);
  assert.deepEqual(record.subjectNodeIds, [subject.id]);
  assert.deepEqual(readAnnotationRefs(subject), [record.id]);
  assert.deepEqual(
    statuses.map((status) => status.message),
    ["Created annotation #1 with 1 badge(s).", "Updated annotation #1 with 0 new badge(s)."],
  );
});

test("adds Subject Nodes to a selected Annotation Card without renumbering or duplicate badges", async () => {
  const page = createPage();
  const subjectA = createNode(page, "subject-a", 0);
  const subjectB = createNode(page, "subject-b", 180);
  const annotationsContainer = createNode(page, "FFA Annotations", 800);
  const existingCard = createNode(annotationsContainer, "FFA Annotation Card #4", 820);
  const existingBadge = createNode(annotationsContainer, "FFA Annotation Badge #4", 850);
  const messages = [];

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  existingCard.setSharedPluginData(namespace, "kind", "annotation-card");
  existingCard.setSharedPluginData(
    namespace,
    "annotation",
    JSON.stringify({
      schemaVersion: 1,
      id: "annotation-existing",
      annotationNumber: 4,
      body: "existing body",
      contextFrameId: page.id,
      subjectNodeIds: ["subject-a"],
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    }),
  );
  existingBadge.setSharedPluginData(namespace, "kind", "annotation-badge");
  existingBadge.setSharedPluginData(
    namespace,
    "badgeRef",
    JSON.stringify({
      schemaVersion: 1,
      annotationId: "annotation-existing",
      annotationNumber: 4,
      subjectNodeId: "subject-a",
      contextFrameId: page.id,
    }),
  );
  subjectA.setSharedPluginData(
    namespace,
    "annotationRefs",
    JSON.stringify({
      schemaVersion: 1,
      annotationIds: ["annotation-existing"],
    }),
  );

  annotationsContainer.children = [existingCard, existingBadge];
  page.children = [subjectA, subjectB, annotationsContainer];
  page.selection = [existingCard, subjectA, subjectB];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

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
  const subjectABadges = badges.filter((badge) => {
    const ref = JSON.parse(badge.getSharedPluginData(namespace, "badgeRef"));
    return ref.subjectNodeId === "subject-a";
  });
  const status = messages.find(
    (message) => message.type === "status" && message.tone === "success",
  );

  assert.equal(updatedRecord.annotationNumber, 4);
  assert.equal(updatedRecord.body, "existing body");
  assert.deepEqual(updatedRecord.subjectNodeIds, ["subject-a", "subject-b"]);
  assert.equal(badges.length, 2);
  assert.equal(subjectABadges.length, 1);
  assert.ok(subjectBBadge);
  assert.deepEqual(readAnnotationRefs(subjectB), ["annotation-existing"]);
  assert.equal(status.message, "Added 1 subject node(s) to annotation #4 with 1 new badge(s).");
});

test("explicitly arranges Annotation Badges and Annotation Cards by Annotation Number", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "context-frame", 0);
  contextFrame.resize(320, 180);
  const subject = createNode(contextFrame, "subject-a", 20);
  subject.absoluteBoundingBox = { x: 20, y: 30, width: 120, height: 60 };
  const annotationsContainer = createNode(page, "FFA Annotations", 800);
  const badge7 = createNode(annotationsContainer, "FFA Annotation Badge #7", 300);
  const badge2 = createNode(annotationsContainer, "FFA Annotation Badge #2", 260);
  const card7 = createNode(annotationsContainer, "FFA Annotation Card #7", 900);
  const card2 = createNode(annotationsContainer, "FFA Annotation Card #2", 940);
  const messages = [];

  annotationsContainer.setSharedPluginData(namespace, "kind", "container");
  setBadgeRecord(badge7, 7, subject.id, page.id);
  setBadgeRecord(badge2, 2, subject.id, page.id);
  setCardRecord(card7, 7, contextFrame.id);
  setCardRecord(card2, 2, contextFrame.id);
  annotationsContainer.children = [badge7, badge2, card7, card2];
  contextFrame.children = [subject];
  page.children = [contextFrame, annotationsContainer];
  page.selection = [subject];
  globalThis.figma = createFigmaStub(page, messages);

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "arrange-badges" });
  await flushPluginMessage(messages);
  assert.equal(badge2.x, 126);
  assert.equal(badge2.y, 16);
  assert.equal(badge7.x, 158);
  assert.equal(badge7.y, 16);

  messages.length = 0;
  globalThis.figma.ui.onmessage({ type: "arrange-cards" });
  await flushPluginMessage(messages);
  assert.equal(card2.x, 0);
  assert.equal(card2.y, 220);
  assert.equal(card7.x, 0);
  assert.equal(card7.y, 336);
});

async function flushStatusCount(messages, count) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (messages.filter((message) => message.type === "status").length >= count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
