import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

const NOW = "2026-05-10T00:00:00.000Z";
const DEFAULT_CONTEXT_BOUNDS = { x: 0, y: 0, width: 320, height: 480 };

function subject(overrides) {
  return {
    ancestorFrameIds: ["frame-common"],
    bounds: { x: 20, y: 40, width: 120, height: 60 },
    existingAnnotationRefCount: 0,
    id: "subject-a",
    name: "Subject A",
    ...overrides,
  };
}

function seed(contextFrameId, annotationNumber) {
  return { contextFrameId, annotationNumber };
}

function context(id, options = {}) {
  return {
    bounds: options.bounds === undefined ? DEFAULT_CONTEXT_BOUNDS : options.bounds,
    id,
    record:
      options.nextAnnotationNumber === undefined
        ? null
        : {
            schemaVersion: 1,
            contextFrameId: id,
            nextAnnotationNumber: options.nextAnnotationNumber,
          },
  };
}

function annotationRecord(core, overrides) {
  return core.createAnnotationRecord({
    annotationId: "annotation-existing",
    annotationNumber: 1,
    body: "Existing body",
    contextFrameId: "frame-common",
    now: NOW,
    subjectNodeIds: ["subject-a"],
    ...overrides,
  });
}

function existingAnnotationCard(seedRecord, options = {}) {
  return {
    annotationCardNodeId:
      options.annotationCardNodeId ??
      `card-${seedRecord.contextFrameId}-${seedRecord.annotationNumber}`,
    existingBadgeSubjectNodeIds: options.existingBadgeSubjectNodeIds ?? [],
    record: options.record ?? null,
    seed: seedRecord,
    subjectAncestorFrameIds: options.subjectAncestorFrameIds ?? [],
  };
}

function createAnnotationCardOperation(plan) {
  return plan.batch.operations.find((operation) => operation.type === "create-annotation-card");
}

test("plans Annotation authoring from subject ancestry, context records, and number seeds", async () => {
  const core = await importCoreModule();
  const plan = core.planAnnotationAuthoring({
    body: "  Shared rule  ",
    contexts: [
      context("frame-common", {
        bounds: { x: 12, y: 24, width: 320, height: 480 },
        nextAnnotationNumber: 9,
      }),
    ],
    createAnnotationId: () => "annotation-new",
    existingAnnotationCards: [
      existingAnnotationCard(seed("frame-common", 3)),
      existingAnnotationCard(seed("page", 11)),
    ],
    now: NOW,
    pageId: "page",
    subjects: [
      subject({
        ancestorFrameIds: ["frame-common", "frame-a"],
        id: "subject-a",
        name: "Subject A",
      }),
      subject({
        ancestorFrameIds: ["frame-common", "frame-b"],
        bounds: { x: 200, y: 40, width: 120, height: 60 },
        existingAnnotationRefCount: 1,
        id: "subject-b",
        name: "Subject B",
      }),
    ],
  });

  assert.equal(plan.mode, "create");
  assert.equal(plan.contextFrameId, "frame-common");
  assert.equal(plan.annotationNumber, 9);
  assert.equal(plan.batch.annotationNumber, 9);
  assert.equal(plan.batch.record.contextFrameId, "frame-common");
  assert.equal(plan.batch.record.body, "Shared rule");
  assert.deepEqual(plan.batch.record.subjectNodeIds, ["subject-a", "subject-b"]);
  assert.deepEqual(createAnnotationCardOperation(plan).basePosition, { x: 12, y: 544 });
});

test("falls back to Temporary Page Context and seeds the next Annotation Number", async () => {
  const core = await importCoreModule();
  const plan = core.planAnnotationAuthoring({
    body: "Page-owned note",
    contexts: [context("page", { bounds: null })],
    createAnnotationId: () => "annotation-new",
    existingAnnotationCards: [
      existingAnnotationCard(seed("page", 2)),
      existingAnnotationCard(seed("frame-a", 8)),
    ],
    now: NOW,
    pageId: "page",
    subjects: [
      subject({
        ancestorFrameIds: ["frame-a"],
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        id: "subject-a",
        name: "Subject A",
      }),
      subject({
        ancestorFrameIds: ["frame-b"],
        bounds: { x: 160, y: 0, width: 100, height: 50 },
        id: "subject-b",
        name: "Subject B",
      }),
    ],
  });

  assert.equal(plan.mode, "create");
  assert.equal(plan.contextFrameId, "page");
  assert.equal(plan.annotationNumber, 3);
  assert.equal(plan.batch.record.contextFrameId, "page");
  assert.deepEqual(createAnnotationCardOperation(plan).basePosition, { x: 0, y: 90 });
  assert.equal(
    plan.batch.operations.find((operation) => operation.type === "set-shared-plugin-data").type,
    "set-shared-plugin-data",
  );
});

test("uses the outermost shared Context Frame for nested subject ancestry", async () => {
  const core = await importCoreModule();
  const plan = core.planAnnotationAuthoring({
    body: "Nested note",
    contexts: [
      context("screen", {
        bounds: { x: 10, y: 20, width: 320, height: 480 },
        nextAnnotationNumber: 5,
      }),
      context("inner-group", { nextAnnotationNumber: 12 }),
    ],
    createAnnotationId: () => "annotation-new",
    existingAnnotationCards: [],
    now: "2026-05-12T00:00:00.000Z",
    pageId: "page",
    subjects: [
      subject({
        ancestorFrameIds: ["screen", "inner-group"],
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        id: "subject-a",
        name: "Subject A",
      }),
    ],
  });

  assert.equal(plan.mode, "create");
  assert.equal(plan.contextFrameId, "screen");
  assert.equal(plan.annotationNumber, 5);
});

test("does not trust a stale context next Annotation Number below existing seeds", async () => {
  const core = await importCoreModule();
  const plan = core.planAnnotationAuthoring({
    body: "Non-duplicate note",
    contexts: [context("frame-common", { nextAnnotationNumber: 2 })],
    createAnnotationId: () => "annotation-new",
    existingAnnotationCards: [
      existingAnnotationCard(seed("frame-common", 1)),
      existingAnnotationCard(seed("frame-common", 3)),
    ],
    now: "2026-05-12T00:00:00.000Z",
    pageId: "page",
    subjects: [
      subject({
        ancestorFrameIds: ["frame-common"],
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        id: "subject-a",
        name: "Subject A",
      }),
    ],
  });

  assert.equal(plan.mode, "create");
  assert.equal(plan.contextFrameId, "frame-common");
  assert.equal(plan.annotationNumber, 4);
});

test("reuses a same-body Annotation in the effective Context Frame", async () => {
  const core = await importCoreModule();
  const plan = core.planAnnotationAuthoring({
    body: "  Shared rule  ",
    contexts: [context("frame-common", { nextAnnotationNumber: 9 })],
    createAnnotationId: () => {
      throw new Error("Reuse mode must not create a new Annotation id.");
    },
    existingAnnotationCards: [
      existingAnnotationCard(seed("frame-common", 2), {
        annotationCardNodeId: "card-existing",
        existingBadgeSubjectNodeIds: ["subject-a"],
        record: annotationRecord(core, {
          annotationId: "annotation-existing",
          annotationNumber: 2,
          body: "Shared rule",
          contextFrameId: "frame-common",
          subjectNodeIds: ["subject-a"],
        }),
        subjectAncestorFrameIds: [["frame-common"]],
      }),
    ],
    now: "2026-05-12T00:00:00.000Z",
    pageId: "page",
    subjects: [
      subject({
        bounds: { x: 160, y: 0, width: 100, height: 50 },
        id: "subject-b",
        name: "Subject B",
      }),
    ],
  });

  assert.equal(plan.mode, "reuse");
  assert.equal(plan.contextFrameId, "frame-common");
  assert.equal(plan.annotationNumber, 2);
  assert.equal(plan.reusableAnnotationCardNodeId, "card-existing");
  assert.equal(plan.batch.kind, "add-annotation-subjects");
  assert.equal(plan.batch.badgeCount, 1);
  assert.deepEqual(plan.batch.record.subjectNodeIds, ["subject-a", "subject-b"]);
});

test("recovers legacy Annotation Number seeds from effective Subject Node contexts", async () => {
  const core = await importCoreModule();
  const plan = core.planAnnotationAuthoring({
    body: "Nested note",
    contexts: [
      context("screen", {
        bounds: { x: 10, y: 20, width: 320, height: 480 },
        nextAnnotationNumber: 1,
      }),
    ],
    createAnnotationId: () => "annotation-new",
    existingAnnotationCards: [
      existingAnnotationCard(seed("inner-group", 4), {
        record: annotationRecord(core, {
          annotationId: "annotation-nested",
          annotationNumber: 4,
          body: "Old nested note",
          contextFrameId: "inner-group",
          subjectNodeIds: ["subject-existing"],
        }),
        subjectAncestorFrameIds: [["screen", "inner-group"]],
      }),
    ],
    now: "2026-05-12T00:00:00.000Z",
    pageId: "page",
    subjects: [
      subject({
        ancestorFrameIds: ["screen", "inner-group"],
        id: "subject-new",
        name: "Subject New",
      }),
    ],
  });

  assert.equal(plan.mode, "create");
  assert.equal(plan.contextFrameId, "screen");
  assert.equal(plan.annotationNumber, 5);
});
