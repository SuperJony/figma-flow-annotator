import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("runs pure validation computation from a structured-clone-safe snapshot", async () => {
  const core = await importCoreModule();
  const now = "2026-05-09T00:00:00.000Z";
  const snapshot = {
    annotationBindings: {
      badges: [],
      cards: [
        {
          nodeId: "card-empty",
          rect: { x: 0, y: 220, width: 280, height: 100 },
          record: {
            id: "annotation-empty",
            annotationNumber: 1,
            body: "",
            contextFrameId: "context-1",
            subjectNodeIds: ["subject-1"],
          },
        },
      ],
      contexts: [{ nodeId: "context-1", rect: { x: 0, y: 0, width: 320, height: 180 } }],
      subjects: [
        {
          annotationIds: ["annotation-empty"],
          nodeId: "subject-1",
          rect: { x: 20, y: 24, width: 100, height: 50 },
        },
      ],
    },
    flowConnectorReferences: {
      connectors: [
        {
          nodeId: "connector-empty-action-root",
          record: core.createFlowConnectorRecord({
            connectorId: "connector-empty-action",
            end: { contextFrameId: "context-1", nodeId: "end-live" },
            flowAction: null,
            now,
            ownerContextFrameId: "context-1",
            start: { contextFrameId: "context-1", nodeId: "start-live" },
          }),
        },
      ],
      endpoints: [
        {
          connectorIds: ["connector-empty-action", "connector-deleted"],
          isEligibleFlowEndpoint: true,
          nodeId: "start-live",
        },
        {
          connectorIds: ["connector-empty-action"],
          isEligibleFlowEndpoint: true,
          nodeId: "end-live",
        },
      ],
    },
    flowConnectorRouteGeometry: {
      connectors: [
        {
          nodeId: "connector-crossing-root",
          obstacles: [
            {
              id: "middle-frame",
              kind: "context-frame",
              rect: { x: 100, y: 0, width: 80, height: 100 },
            },
          ],
          record: core.createFlowConnectorRecord({
            connectorId: "connector-crossing",
            end: { contextFrameId: "context-1", nodeId: "end-crossing" },
            flowAction: "cross",
            now,
            ownerContextFrameId: "context-1",
            routePoints: [
              { x: 0, y: 50 },
              { x: 240, y: 50 },
            ],
            start: { contextFrameId: "context-1", nodeId: "start-crossing" },
          }),
        },
      ],
    },
  };

  const clonedSnapshot = structuredClone(snapshot);
  assert.deepEqual(clonedSnapshot, snapshot);

  const report = core.runValidationComputation(clonedSnapshot);

  assert.deepEqual(report.summary, {
    all: 5,
    errors: 2,
    warnings: 3,
    info: 0,
  });
  assert.deepEqual(
    report.issues.map((issue) => [issue.code, issue.severity]),
    [
      ["annotation-missing-badge", "warning"],
      ["annotation-missing-body", "error"],
      ["flow-action-empty", "warning"],
      ["connector-reverse-index-stale", "warning"],
      ["connector-route-crosses-obstacle", "error"],
    ],
  );
  assert.deepEqual(
    report.issues.map((issue) => issue.locationNodeIds),
    [
      ["card-empty", "subject-1"],
      ["card-empty"],
      ["connector-empty-action-root"],
      ["start-live"],
      ["connector-crossing-root"],
    ],
  );
});
