import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("validates Connector Trunk missing and unexpected anomalies", async () => {
  const core = await importCoreModule();
  const now = "2026-05-09T00:00:00.000Z";
  const missingA = core.createFlowConnectorRecord({
    connectorId: "connector-missing-a",
    end: { contextFrameId: "context", nodeId: "shared-end" },
    flowAction: "A",
    now,
    ownerContextFrameId: "context",
    routePoints: [
      { x: 80, y: 20 },
      { x: 320, y: 20 },
      { x: 400, y: 20 },
    ],
    start: { contextFrameId: "context", nodeId: "start-a" },
  });
  const missingB = core.createFlowConnectorRecord({
    connectorId: "connector-missing-b",
    end: { contextFrameId: "context", nodeId: "shared-end" },
    flowAction: "B",
    now,
    ownerContextFrameId: "context",
    routePoints: [
      { x: 80, y: 80 },
      { x: 340, y: 80 },
      { x: 400, y: 80 },
    ],
    start: { contextFrameId: "context", nodeId: "start-b" },
  });
  const unexpectedA = core.createFlowConnectorRecord({
    connectorId: "connector-unexpected-a",
    end: { contextFrameId: "context", nodeId: "end-a" },
    flowAction: "C",
    now,
    ownerContextFrameId: "context",
    routePoints: [
      { x: 80, y: 160 },
      { x: 320, y: 160 },
      { x: 400, y: 160 },
    ],
    start: { contextFrameId: "context", nodeId: "start-c" },
  });
  const unexpectedB = core.createFlowConnectorRecord({
    connectorId: "connector-unexpected-b",
    end: { contextFrameId: "context", nodeId: "end-b" },
    flowAction: "D",
    now,
    ownerContextFrameId: "context",
    routePoints: [
      { x: 80, y: 220 },
      { x: 320, y: 160 },
      { x: 400, y: 160 },
    ],
    start: { contextFrameId: "context", nodeId: "start-d" },
  });

  const report = core.validateFlowConnectorRouteGeometry({
    connectors: [
      { nodeId: "connector-missing-root-a", obstacles: [], record: missingA },
      { nodeId: "connector-missing-root-b", obstacles: [], record: missingB },
      { nodeId: "connector-unexpected-root-a", obstacles: [], record: unexpectedA },
      { nodeId: "connector-unexpected-root-b", obstacles: [], record: unexpectedB },
    ],
  });

  assert.deepEqual(
    report.issues.map((issue) => [issue.code, issue.severity]),
    [
      ["connector-trunk-missing", "warning"],
      ["connector-trunk-unexpected", "error"],
    ],
  );
  assert.deepEqual(
    report.issues.find((issue) => issue.code === "connector-trunk-missing").locationNodeIds,
    ["connector-missing-root-a", "connector-missing-root-b"],
  );
  assert.deepEqual(
    report.issues.find((issue) => issue.code === "connector-trunk-unexpected").locationNodeIds,
    ["connector-unexpected-root-a", "connector-unexpected-root-b"],
  );
});
