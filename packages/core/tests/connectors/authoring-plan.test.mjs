import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("plans Flow Connector create authoring by routing and detecting existing directed connectors", async () => {
  const core = await importCoreModule();
  let allocatedId = null;
  const existingRecord = core.createFlowConnectorRecord({
    connectorId: "connector-existing",
    createdAt: "2026-05-09T00:00:00.000Z",
    end: { contextFrameId: "frame-b", nodeId: "node-b" },
    flowAction: "click",
    now: "2026-05-09T00:00:00.000Z",
    ownerContextFrameId: "frame-a",
    routePoints: [
      { x: 100, y: 50 },
      { x: 200, y: 50 },
    ],
    start: { contextFrameId: "frame-a", nodeId: "node-a" },
  });
  const plan = core.planCreateFlowConnectorAuthoring({
    createConnectorId: () => {
      allocatedId = "connector-new";
      return allocatedId;
    },
    flowAction: " choose ",
    now: "2026-05-10T00:00:00.000Z",
    routeFacts: {
      endpoints: [
        endpoint("node-a", "Start", "frame-a", { x: 0, y: 0, width: 100, height: 100 }),
        endpoint("node-b", "End", "frame-b", { x: 360, y: 0, width: 100, height: 100 }),
      ],
      existingConnectors: [{ nodeId: "connector-node", record: existingRecord }],
      obstacles: [],
    },
  });

  assert.equal(allocatedId, null);
  assert.equal(plan.existingConnector.nodeId, "connector-node");
  assert.equal(plan.batch.mode, "update");
  assert.equal(plan.batch.connectorId, "connector-existing");
  assert.equal(plan.batch.record.flowAction, "choose");
  assert.deepEqual(
    plan.batch.operations.map((operation) => operation.type),
    ["update-flow-connector", "set-shared-plugin-data", "update-validation-index"],
  );
  const indexOperation = plan.batch.operations.at(-1);
  assert.equal(indexOperation.type, "update-validation-index");
  assert.deepEqual(indexOperation.upsert.nodeIds.flowEndpointNodeIds, ["node-a", "node-b"]);
  assert.deepEqual(indexOperation.upsert.nodeTargets.connectorRootNodeIds, [
    { kind: "existing-node", nodeId: "connector-node" },
  ]);
  assert.ok(plan.routePoints.length >= 2);
});

test("plans new Flow Connector authoring with route cache and reverse references", async () => {
  const core = await importCoreModule();
  let allocationCount = 0;
  const plan = core.planCreateFlowConnectorAuthoring({
    createConnectorId: () => {
      allocationCount += 1;
      return "connector-new";
    },
    flowAction: "",
    now: "2026-05-10T00:00:00.000Z",
    routeFacts: {
      endpoints: [
        endpoint("node-a", "Start", "frame-a", { x: 0, y: 0, width: 100, height: 100 }),
        endpoint("node-b", "End", "frame-b", { x: 360, y: 0, width: 100, height: 100 }),
      ],
      existingConnectors: [],
      obstacles: [],
    },
  });

  assert.equal(allocationCount, 1);
  assert.equal(plan.batch.mode, "create");
  assert.equal(plan.batch.connectorId, "connector-new");
  assert.equal(plan.batch.record.ownerContextFrameId, "frame-a");
  assert.equal(plan.batch.record.flowAction, null);
  assert.deepEqual(plan.batch.record.routeCache.points, plan.routePoints);
  assert.deepEqual(
    plan.batch.operations
      .filter((operation) => operation.type === "append-shared-reference")
      .map((operation) => operation.targetNodeId),
    ["node-a", "node-b"],
  );
  const indexOperation = plan.batch.operations.find(
    (operation) => operation.type === "update-validation-index",
  );
  assert.deepEqual(indexOperation.upsert.nodeTargets.connectorRootNodeIds, [
    { kind: "created-node", ref: "flow-connector" },
  ]);
});

function endpoint(id, name, contextFrameId, bounds) {
  return {
    bounds,
    contextFrameId,
    hasGeneratedAncestor: false,
    id,
    name,
  };
}
