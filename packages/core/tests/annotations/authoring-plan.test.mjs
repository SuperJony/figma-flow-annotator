import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("plans Annotation authoring from subject ancestry, context records, and number seeds", async () => {
  const core = await importCoreModule();
  const plan = core.planCreateAnnotationAuthoring({
    annotationId: "annotation-new",
    body: "  Shared rule  ",
    contextRecords: [{ schemaVersion: 1, contextFrameId: "frame-common", nextAnnotationNumber: 9 }],
    existingAnnotationNumberSeeds: [
      { contextFrameId: "frame-common", annotationNumber: 3 },
      { contextFrameId: "page", annotationNumber: 11 },
    ],
    now: "2026-05-10T00:00:00.000Z",
    pageId: "page",
    subjects: [
      {
        ancestorFrameIds: ["frame-common", "frame-a"],
        bounds: { x: 20, y: 40, width: 120, height: 60 },
        existingAnnotationRefCount: 0,
        id: "subject-a",
        name: "Subject A",
      },
      {
        ancestorFrameIds: ["frame-common", "frame-b"],
        bounds: { x: 200, y: 40, width: 120, height: 60 },
        existingAnnotationRefCount: 1,
        id: "subject-b",
        name: "Subject B",
      },
    ],
  });

  assert.equal(plan.contextFrameId, "frame-common");
  assert.equal(plan.annotationNumber, 9);
  assert.equal(plan.batch.annotationNumber, 9);
  assert.equal(plan.batch.record.contextFrameId, "frame-common");
  assert.equal(plan.batch.record.body, "Shared rule");
  assert.deepEqual(plan.batch.record.subjectNodeIds, ["subject-a", "subject-b"]);
});

test("falls back to Temporary Page Context and seeds the next Annotation Number", async () => {
  const core = await importCoreModule();
  const plan = core.planCreateAnnotationAuthoring({
    annotationId: "annotation-new",
    body: "Page-owned note",
    contextRecords: [],
    existingAnnotationNumberSeeds: [
      { contextFrameId: "page", annotationNumber: 2 },
      { contextFrameId: "frame-a", annotationNumber: 8 },
    ],
    now: "2026-05-10T00:00:00.000Z",
    pageId: "page",
    subjects: [
      {
        ancestorFrameIds: ["frame-a"],
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: "subject-a",
        name: "Subject A",
      },
      {
        ancestorFrameIds: ["frame-b"],
        bounds: { x: 160, y: 0, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: "subject-b",
        name: "Subject B",
      },
    ],
  });

  assert.equal(plan.contextFrameId, "page");
  assert.equal(plan.annotationNumber, 3);
  assert.equal(plan.batch.record.contextFrameId, "page");
  assert.equal(
    plan.batch.operations.find((operation) => operation.type === "set-shared-plugin-data").type,
    "set-shared-plugin-data",
  );
});

test("uses the outermost shared Context Frame for nested subject ancestry", async () => {
  const core = await importCoreModule();
  const plan = core.planCreateAnnotationAuthoring({
    annotationId: "annotation-new",
    body: "Nested note",
    contextRecords: [
      { schemaVersion: 1, contextFrameId: "screen", nextAnnotationNumber: 5 },
      { schemaVersion: 1, contextFrameId: "inner-group", nextAnnotationNumber: 12 },
    ],
    existingAnnotationNumberSeeds: [],
    now: "2026-05-12T00:00:00.000Z",
    pageId: "page",
    subjects: [
      {
        ancestorFrameIds: ["screen", "inner-group"],
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: "subject-a",
        name: "Subject A",
      },
    ],
  });

  assert.equal(plan.contextFrameId, "screen");
  assert.equal(plan.annotationNumber, 5);
});

test("does not trust a stale context next Annotation Number below existing seeds", async () => {
  const core = await importCoreModule();
  const plan = core.planCreateAnnotationAuthoring({
    annotationId: "annotation-new",
    body: "Non-duplicate note",
    contextRecords: [{ schemaVersion: 1, contextFrameId: "frame-common", nextAnnotationNumber: 2 }],
    existingAnnotationNumberSeeds: [
      { contextFrameId: "frame-common", annotationNumber: 1 },
      { contextFrameId: "frame-common", annotationNumber: 3 },
    ],
    now: "2026-05-12T00:00:00.000Z",
    pageId: "page",
    subjects: [
      {
        ancestorFrameIds: ["frame-common"],
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: "subject-a",
        name: "Subject A",
      },
    ],
  });

  assert.equal(plan.contextFrameId, "frame-common");
  assert.equal(plan.annotationNumber, 4);
});
