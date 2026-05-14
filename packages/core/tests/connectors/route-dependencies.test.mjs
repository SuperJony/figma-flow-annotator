import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("plans Create Flow Connector route dependencies without runtime facts", async () => {
  const core = await importCoreModule();
  const existingRecord = core.createFlowConnectorRecord({
    connectorId: "connector-existing",
    createdAt: "2026-05-13T00:00:00.000Z",
    end: { contextFrameId: "frame-c", nodeId: "node-c" },
    flowAction: "click",
    now: "2026-05-13T00:00:00.000Z",
    ownerContextFrameId: "frame-a",
    routePoints: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    start: { contextFrameId: "frame-a", nodeId: "node-a" },
  });

  const plan = core.planCreateFlowConnectorRouteDependencies({
    endpoints: [
      { id: "node-a", name: "Start", contextFrameId: "frame-a" },
      { id: "node-b", name: "End", contextFrameId: "frame-b" },
    ],
    existingConnectors: [{ nodeId: "connector-node", record: existingRecord }],
    validationIndex: validationIndex({
      annotationBadgeNodeIds: ["badge-1"],
      annotationCardNodeIds: ["card-1"],
      connectorObstacleCandidateNodeIds: ["card-1", "badge-1", "frame-d"],
      contextFrameIds: ["frame-b"],
      ownerContextFrameIds: ["frame-owner"],
    }),
  });

  assert.deepEqual(
    dependenciesFor(plan, "flow-endpoint").map((dependency) => [
      dependency.nodeId,
      dependency.classification,
    ]),
    [
      ["node-a", "selected-start-endpoint"],
      ["node-b", "selected-end-endpoint"],
      ["node-a", "connector-record-endpoint"],
      ["node-c", "connector-record-endpoint"],
    ],
  );
  assert.deepEqual(
    core.collectFlowConnectorRouteDependencyNodeIds(
      plan.dependencies,
      "connector-obstacle-candidate",
    ),
    ["frame-a", "frame-b", "card-1", "frame-owner", "frame-d", "frame-c", "node-a", "node-c"],
  );
  assert.deepEqual(
    dependenciesFor(plan, "existing-flow-connector").map((dependency) => dependency.nodeId),
    ["connector-node"],
  );
  assert.equal(
    plan.dependencies.some((dependency) => dependency.nodeId === "badge-1"),
    false,
  );
  assert.equal(JSON.stringify(plan).includes("bounds"), false);
  assert.equal(JSON.stringify(plan).includes("absoluteBoundingBox"), false);
});

test("exposes shared route dependency planners for refresh and validation", async () => {
  const core = await importCoreModule();
  const connector = {
    nodeId: "connector-node",
    record: core.createFlowConnectorRecord({
      connectorId: "connector-existing",
      createdAt: "2026-05-13T00:00:00.000Z",
      end: { contextFrameId: "frame-b", nodeId: "node-b" },
      flowAction: null,
      now: "2026-05-13T00:00:00.000Z",
      ownerContextFrameId: "frame-a",
      start: { contextFrameId: "frame-a", nodeId: "node-a" },
    }),
  };

  const refreshPlan = core.planRefreshFlowConnectorRouteDependencies({
    connectors: [connector],
    selectedConnectorNodeIds: ["connector-node"],
    validationIndex: validationIndex({}),
  });
  const validationPlan = core.planValidateFlowConnectorRouteDependencies({
    connectors: [connector],
    explicitObstacleCandidateNodeIds: ["explicit-obstacle"],
    validationIndex: validationIndex({}),
  });

  assert.deepEqual(
    core.collectFlowConnectorRouteDependencyNodeIds(
      refreshPlan.dependencies,
      "existing-flow-connector",
    ),
    ["connector-node"],
  );
  assert.equal(
    core
      .collectFlowConnectorRouteDependencyNodeIds(
        validationPlan.dependencies,
        "connector-obstacle-candidate",
      )
      .includes("explicit-obstacle"),
    true,
  );
});

function dependenciesFor(plan, role) {
  return plan.dependencies.filter((dependency) => dependency.role === role);
}

function validationIndex(update) {
  return {
    schemaVersion: 1,
    subjectNodeIds: [],
    annotationCardNodeIds: [],
    annotationBadgeNodeIds: [],
    flowEndpointNodeIds: [],
    contextFrameIds: [],
    ownerContextFrameIds: [],
    connectorRootNodeIds: [],
    connectorObstacleCandidateNodeIds: [],
    ...update,
  };
}
