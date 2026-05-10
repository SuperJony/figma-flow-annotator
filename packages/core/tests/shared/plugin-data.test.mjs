import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("exports shared plugin data namespace and key conventions", async () => {
  const core = await importCoreModule();

  assert.equal(core.SHARED_PLUGIN_DATA.namespace, "figma_flow_annotator");
  assert.deepEqual(Object.values(core.SHARED_PLUGIN_DATA.keys), [
    "kind",
    "annotation",
    "badgeRef",
    "connector",
    "annotationRefs",
    "connectorRefs",
    "context",
  ]);
});

test("decodes versioned shared plugin data records in core", async () => {
  const core = await importCoreModule();
  const now = "2026-05-10T00:00:00.000Z";

  assert.deepEqual(
    core.decodeAnnotationRecord(
      JSON.stringify({
        schemaVersion: 1,
        id: "annotation-1",
        annotationNumber: 2,
        title: "Title",
        body: "Body",
        kind: "rule",
        contextFrameId: "context",
        subjectNodeIds: ["subject-a", 42, "subject-b"],
        createdAt: now,
        updatedAt: now,
      }),
    ),
    {
      schemaVersion: 1,
      id: "annotation-1",
      annotationNumber: 2,
      title: "Title",
      body: "Body",
      kind: "rule",
      contextFrameId: "context",
      subjectNodeIds: ["subject-a", "subject-b"],
      createdAt: now,
      updatedAt: now,
    },
  );

  assert.deepEqual(
    core.decodeBadgeRefRecord(
      JSON.stringify({
        schemaVersion: 1,
        annotationId: "annotation-1",
        annotationNumber: 2,
        subjectNodeId: "subject-a",
        contextFrameId: "context",
      }),
    ),
    {
      schemaVersion: 1,
      annotationId: "annotation-1",
      annotationNumber: 2,
      subjectNodeId: "subject-a",
      contextFrameId: "context",
    },
  );

  assert.deepEqual(
    core.decodeContextRecord(
      JSON.stringify({
        schemaVersion: 1,
        contextFrameId: "context",
        nextAnnotationNumber: 3,
      }),
      "context",
    ),
    {
      schemaVersion: 1,
      contextFrameId: "context",
      nextAnnotationNumber: 3,
    },
  );
  assert.deepEqual(
    core.decodeAnnotationNumberSeedRecord(
      JSON.stringify({
        schemaVersion: 1,
        id: "annotation-1",
        annotationNumber: 2,
        contextFrameId: "context",
        subjectNodeIds: ["subject-a"],
      }),
    ),
    {
      annotationNumber: 2,
      contextFrameId: "context",
    },
  );

  assert.deepEqual(
    core.decodeFlowConnectorRecord(
      JSON.stringify({
        schemaVersion: 1,
        id: "connector-1",
        start: { nodeId: "start", contextFrameId: "context" },
        end: { nodeId: "end", contextFrameId: "context" },
        ownerContextFrameId: "context",
        flowAction: null,
        routeCache: {
          schemaVersion: 1,
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
        createdAt: now,
        updatedAt: now,
      }),
    )?.routeCache?.points,
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  );

  assert.deepEqual(
    core.decodeAnnotationRefsRecord('{"schemaVersion":1,"annotationIds":["a",5,"b"]}'),
    {
      schemaVersion: 1,
      annotationIds: ["a", "b"],
    },
  );
  assert.deepEqual(
    core.decodeConnectorRefsRecord('{"schemaVersion":1,"connectorIds":["c",false]}'),
    {
      schemaVersion: 1,
      connectorIds: ["c"],
    },
  );
  assert.deepEqual(core.decodeAnnotationReferenceIds('{"annotationIds":["legacy",7]}'), ["legacy"]);
  assert.deepEqual(core.decodeConnectorReferenceIds('{"connectorIds":["legacy",false]}'), [
    "legacy",
  ]);
});

test("rejects invalid shared plugin data records", async () => {
  const core = await importCoreModule();

  assert.equal(core.decodeAnnotationRecord("not json"), null);
  assert.equal(
    core.decodeAnnotationRecord(
      JSON.stringify({
        schemaVersion: 1,
        id: "annotation-1",
        annotationNumber: 1,
        body: "",
        contextFrameId: "context",
        subjectNodeIds: ["subject"],
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      }),
    ),
    null,
  );
  assert.equal(
    core.decodeContextRecord(
      JSON.stringify({
        schemaVersion: 1,
        contextFrameId: "other-context",
        nextAnnotationNumber: 3,
      }),
      "context",
    ),
    null,
  );
  assert.equal(core.decodeAnnotationNumberSeedRecord('{"contextFrameId":"context"}'), null);
  assert.equal(
    core.decodeFlowConnectorRecord(
      JSON.stringify({
        schemaVersion: 1,
        id: "connector-1",
        start: { nodeId: "start", contextFrameId: "context" },
        end: { nodeId: "end" },
        ownerContextFrameId: "context",
        flowAction: null,
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      }),
    ),
    null,
  );
});
