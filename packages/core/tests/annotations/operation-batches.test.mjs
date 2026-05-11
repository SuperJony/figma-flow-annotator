import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("builds v1 Annotation records and a Figma File Operation Batch shape", async () => {
  const core = await importCoreModule();
  const batch = core.buildCreateAnnotationOperationBatch({
    annotationId: "annotation-1",
    annotationNumber: 3,
    body: "  Explain this state.  ",
    contextFrameId: "frame-1",
    now: "2026-05-09T00:00:00.000Z",
    subjects: [
      {
        bounds: { x: 10, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: "subject-1",
        name: "Primary Button",
      },
      {
        bounds: { x: 150, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 1,
        id: "subject-2",
        name: "Secondary Button",
      },
    ],
  });

  assert.equal(batch.schemaVersion, 1);
  assert.equal(batch.kind, "create-annotation");
  assert.equal(batch.record.schemaVersion, 1);
  assert.equal(batch.record.body, "Explain this state.");
  assert.deepEqual(batch.record.subjectNodeIds, ["subject-1", "subject-2"]);
  assert.equal(batch.badgeCount, 2);
  assert.ok(batch.operations.some((operation) => operation.type === "create-annotation-card"));
  assert.equal(
    batch.operations.filter((operation) => operation.type === "append-shared-reference").length,
    2,
  );
  const indexOperation = batch.operations.find(
    (operation) => operation.type === "update-validation-index",
  );
  assert.deepEqual(indexOperation.upsert.nodeIds.subjectNodeIds, ["subject-1", "subject-2"]);
  assert.deepEqual(indexOperation.upsert.nodeIds.contextFrameIds, ["frame-1"]);
  assert.deepEqual(
    indexOperation.upsert.nodeTargets.annotationBadgeNodeIds.map((target) => target.ref),
    ["annotation-badge-1", "annotation-badge-2"],
  );
});

test("builds Annotation maintenance operation batches with stable numbers and badge dedupe", async () => {
  const core = await importCoreModule();
  const batch = core.buildAddAnnotationSubjectsOperationBatch({
    annotation: {
      schemaVersion: 1,
      id: "annotation-1",
      annotationNumber: 8,
      body: "Existing body",
      contextFrameId: "frame-1",
      subjectNodeIds: ["subject-1"],
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    },
    annotationCardNodeId: "card-1",
    existingBadgeSubjectNodeIds: ["subject-1", "subject-3"],
    now: "2026-05-09T00:00:00.000Z",
    subjects: [
      {
        bounds: { x: 10, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 1,
        id: "subject-1",
        name: "Already bound",
      },
      {
        bounds: { x: 160, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: "subject-2",
        name: "New subject",
      },
      {
        bounds: { x: 310, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: "subject-3",
        name: "New but already badged",
      },
    ],
  });

  assert.equal(batch.kind, "add-annotation-subjects");
  assert.equal(batch.annotationNumber, 8);
  assert.deepEqual(batch.record.subjectNodeIds, ["subject-1", "subject-2", "subject-3"]);
  assert.equal(batch.record.body, "Existing body");
  assert.equal(batch.badgeCount, 1);
  assert.deepEqual(batch.addedSubjectNodeIds, ["subject-2", "subject-3"]);
  assert.equal(
    batch.operations.filter((operation) => operation.type === "create-annotation-badge").length,
    1,
  );
  assert.equal(
    batch.operations.filter((operation) => operation.type === "append-shared-reference").length,
    2,
  );
  const indexOperation = batch.operations.find(
    (operation) => operation.type === "update-validation-index",
  );
  assert.deepEqual(indexOperation.upsert.nodeIds.subjectNodeIds, [
    "subject-1",
    "subject-2",
    "subject-3",
  ]);
  assert.deepEqual(indexOperation.upsert.nodeTargets.annotationCardNodeIds, [
    { kind: "existing-node", nodeId: "card-1" },
  ]);
});

test("builds explicit badge and card arrange operation batches by Annotation Number", async () => {
  const core = await importCoreModule();
  const badgeBatch = core.buildArrangeAnnotationBadgesOperationBatch({
    subjects: [
      {
        bounds: { x: 100, y: 40, width: 80, height: 48 },
        badges: [
          { annotationNumber: 9, nodeId: "badge-9" },
          { annotationNumber: 2, nodeId: "badge-2" },
        ],
        id: "subject-1",
      },
    ],
  });
  const cardBatch = core.buildArrangeAnnotationCardsOperationBatch({
    basePosition: { x: 20, y: 200 },
    cards: [
      { annotationNumber: 5, nodeId: "card-5", rect: { x: 90, y: 90, width: 280, height: 120 } },
      { annotationNumber: 1, nodeId: "card-1", rect: { x: 30, y: 60, width: 280, height: 100 } },
    ],
  });

  assert.equal(badgeBatch.kind, "arrange-annotation-badges");
  assert.deepEqual(badgeBatch.movedBadgeNodeIds, ["badge-2", "badge-9"]);
  assert.deepEqual(
    badgeBatch.operations
      .filter((operation) => operation.type === "move-node")
      .map((operation) => operation.position),
    [
      { x: 166, y: 26 },
      { x: 198, y: 26 },
    ],
  );
  assert.equal(cardBatch.kind, "arrange-annotation-cards");
  assert.deepEqual(cardBatch.movedCardNodeIds, ["card-1", "card-5"]);
  assert.deepEqual(
    cardBatch.operations
      .filter((operation) => operation.type === "move-node")
      .map((operation) => operation.position),
    [
      { x: 20, y: 200 },
      { x: 20, y: 316 },
    ],
  );
});
