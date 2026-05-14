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
    explicitAnnotationCardNodeIds: ["explicit-card"],
    flowActionLabelNodeIds: [
      {
        nodeId: "label-node",
        sourceConnectorNodeId: "connector-node",
      },
    ],
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
      .includes("explicit-card"),
    true,
  );
  assert.deepEqual(
    dependenciesFor(validationPlan, "flow-action-label").map((dependency) => [
      dependency.nodeId,
      dependency.classification,
      dependency.sourceConnectorNodeId,
    ]),
    [["label-node", "flow-action-label", "connector-node"]],
  );
});

test("plans selected and page Refresh Connectors dependencies without runtime facts", async () => {
  const core = await importCoreModule();
  const connectorA = {
    nodeId: "connector-node-a",
    record: core.createFlowConnectorRecord({
      connectorId: "connector-a",
      createdAt: "2026-05-13T00:00:00.000Z",
      end: { contextFrameId: "frame-b", nodeId: "node-b" },
      flowAction: null,
      now: "2026-05-13T00:00:00.000Z",
      ownerContextFrameId: "owner-a",
      start: { contextFrameId: "frame-a", nodeId: "node-a" },
    }),
  };
  const connectorB = {
    nodeId: "connector-node-b",
    record: core.createFlowConnectorRecord({
      connectorId: "connector-b",
      createdAt: "2026-05-13T00:00:00.000Z",
      end: { contextFrameId: "frame-d", nodeId: "node-d" },
      flowAction: null,
      now: "2026-05-13T00:00:00.000Z",
      ownerContextFrameId: "owner-c",
      start: { contextFrameId: "frame-c", nodeId: "node-c" },
    }),
  };
  const sharedIndex = validationIndex({
    annotationBadgeNodeIds: ["badge-1"],
    annotationCardNodeIds: ["card-1"],
    connectorObstacleCandidateNodeIds: ["card-1", "badge-1", "indexed-frame"],
    contextFrameIds: ["context-frame"],
    ownerContextFrameIds: ["owner-frame"],
  });

  const selectedPlan = core.planRefreshFlowConnectorRouteDependencies({
    connectors: [connectorA, connectorB],
    selectedConnectorNodeIds: ["connector-node-a"],
    validationIndex: sharedIndex,
  });
  const pagePlan = core.planRefreshFlowConnectorRouteDependencies({
    connectors: [connectorA, connectorB],
    validationIndex: sharedIndex,
  });

  assert.deepEqual(
    dependenciesFor(selectedPlan, "existing-flow-connector").map((dependency) => [
      dependency.nodeId,
      dependency.sourceConnectorNodeId,
    ]),
    [["connector-node-a", "connector-node-a"]],
  );
  assert.deepEqual(
    dependenciesFor(selectedPlan, "flow-endpoint").map((dependency) => [
      dependency.nodeId,
      dependency.sourceConnectorNodeId,
    ]),
    [
      ["node-a", "connector-node-a"],
      ["node-b", "connector-node-a"],
    ],
  );
  assert.deepEqual(
    core.collectFlowConnectorRouteDependencyNodeIds(
      selectedPlan.dependencies,
      "connector-obstacle-candidate",
    ),
    [
      "card-1",
      "context-frame",
      "owner-frame",
      "indexed-frame",
      "frame-a",
      "frame-b",
      "owner-a",
      "node-a",
      "node-b",
    ],
  );
  assert.equal(
    selectedPlan.dependencies.some((dependency) => dependency.nodeId === "badge-1"),
    false,
  );
  assert.deepEqual(
    selectedPlan.existingConnectors.map((connector) => connector.nodeId),
    ["connector-node-a", "connector-node-b"],
  );
  assert.deepEqual(
    dependenciesFor(pagePlan, "existing-flow-connector").map((dependency) => dependency.nodeId),
    ["connector-node-a", "connector-node-b"],
  );
  assert.deepEqual(
    dependenciesFor(pagePlan, "flow-endpoint").map((dependency) => dependency.nodeId),
    ["node-a", "node-b", "node-c", "node-d"],
  );
  assert.equal(JSON.stringify(selectedPlan).includes("bounds"), false);
  assert.equal(JSON.stringify(selectedPlan).includes("absoluteBoundingBox"), false);
});

test("plans Validate Bindings route dependencies without runtime facts", async () => {
  const core = await importCoreModule();
  const connectorA = {
    nodeId: "connector-node-a",
    record: core.createFlowConnectorRecord({
      connectorId: "connector-a",
      createdAt: "2026-05-13T00:00:00.000Z",
      end: { contextFrameId: "frame-b", nodeId: "node-b" },
      flowAction: "open",
      now: "2026-05-13T00:00:00.000Z",
      ownerContextFrameId: "owner-a",
      routePoints: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      start: { contextFrameId: "frame-a", nodeId: "node-a" },
    }),
  };
  const connectorB = {
    nodeId: "connector-node-b",
    record: core.createFlowConnectorRecord({
      connectorId: "connector-b",
      createdAt: "2026-05-13T00:00:00.000Z",
      end: { contextFrameId: "frame-d", nodeId: "node-d" },
      flowAction: null,
      now: "2026-05-13T00:00:00.000Z",
      ownerContextFrameId: "owner-c",
      start: { contextFrameId: "frame-c", nodeId: "node-c" },
    }),
  };

  const plan = core.planValidateFlowConnectorRouteDependencies({
    connectors: [connectorA, connectorB],
    explicitAnnotationCardNodeIds: ["explicit-card"],
    flowActionLabelNodeIds: [
      { nodeId: "label-a", sourceConnectorNodeId: "connector-node-a" },
      { nodeId: "label-b", sourceConnectorNodeId: "connector-node-b" },
    ],
    validationIndex: validationIndex({
      annotationBadgeNodeIds: ["badge-1"],
      annotationCardNodeIds: ["indexed-card"],
      connectorObstacleCandidateNodeIds: ["indexed-card", "badge-1", "indexed-frame"],
      contextFrameIds: ["context-frame"],
      ownerContextFrameIds: ["owner-frame"],
    }),
  });

  assert.deepEqual(
    dependenciesFor(plan, "existing-flow-connector").map((dependency) => [
      dependency.nodeId,
      dependency.classification,
      dependency.sourceConnectorNodeId,
    ]),
    [
      ["connector-node-a", "existing-flow-connector-root", "connector-node-a"],
      ["connector-node-b", "existing-flow-connector-root", "connector-node-b"],
    ],
  );
  assert.deepEqual(
    dependenciesFor(plan, "flow-endpoint").map((dependency) => [
      dependency.nodeId,
      dependency.classification,
      dependency.sourceConnectorNodeId,
    ]),
    [
      ["node-a", "connector-record-endpoint", "connector-node-a"],
      ["node-b", "connector-record-endpoint", "connector-node-a"],
      ["node-c", "connector-record-endpoint", "connector-node-b"],
      ["node-d", "connector-record-endpoint", "connector-node-b"],
    ],
  );
  assert.deepEqual(
    core.collectFlowConnectorRouteDependencyNodeIds(
      plan.dependencies,
      "connector-obstacle-candidate",
    ),
    [
      "indexed-card",
      "context-frame",
      "owner-frame",
      "indexed-frame",
      "explicit-card",
      "frame-a",
      "frame-b",
      "owner-a",
      "node-a",
      "node-b",
      "frame-c",
      "frame-d",
      "owner-c",
      "node-c",
      "node-d",
    ],
  );
  assert.deepEqual(
    dependenciesFor(plan, "flow-action-label").map((dependency) => [
      dependency.nodeId,
      dependency.sourceConnectorNodeId,
    ]),
    [
      ["label-a", "connector-node-a"],
      ["label-b", "connector-node-b"],
    ],
  );
  assert.equal(
    plan.dependencies.some((dependency) => dependency.nodeId === "badge-1"),
    false,
  );
  assert.equal(JSON.stringify(plan).includes("bounds"), false);
  assert.equal(JSON.stringify(plan).includes("absoluteBoundingBox"), false);
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
