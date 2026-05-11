import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("plans selected Flow Connector refreshes with page-level Connector Trunk assignments", async () => {
  const core = await importCoreModule();
  const now = "2026-05-10T00:00:00.000Z";
  const startA = endpoint("start-a", "Start A", { x: 0, y: 0, width: 100, height: 100 });
  const startB = endpoint("start-b", "Start B", { x: 0, y: 220, width: 100, height: 100 });
  const end = endpoint("end", "End", { x: 520, y: 110, width: 100, height: 100 });
  const routeA = core.routeOrthogonalConnector({
    startRect: startA.bounds,
    endRect: end.bounds,
    obstacles: [],
  }).points;
  const routeB = core.routeOrthogonalConnector({
    startRect: startB.bounds,
    endRect: end.bounds,
    obstacles: [],
  }).points;
  assert.deepEqual(finalSegment(routeA), finalSegment(routeB));

  const recordA = createRecord(core, {
    connectorId: "connector-a",
    end,
    now,
    routePoints: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    start: startA,
  });
  const recordB = createRecord(core, {
    connectorId: "connector-b",
    end,
    now,
    routePoints: routeB,
    start: startB,
  });

  const plan = core.planFlowConnectorRouteLayoutSet({
    now: "2026-05-10T01:00:00.000Z",
    routeFacts: {
      connectors: [
        {
          end,
          name: "Connector A",
          nodeId: "connector-node-a",
          obstacles: [],
          record: recordA,
          start: startA,
        },
        {
          name: "Connector B",
          nodeId: "connector-node-b",
          record: recordB,
        },
      ],
      selectedConnectorNodeIds: ["connector-node-a"],
    },
  });

  assert.equal(plan.selectedOnly, true);
  assert.deepEqual(plan.targetConnectorNodeIds, ["connector-node-a"]);
  assert.deepEqual(plan.failures, []);
  assert.equal(plan.refreshes.length, 1);
  assert.equal(plan.refreshes[0].connectorNodeId, "connector-node-a");
  assert.equal(plan.refreshes[0].batch.kind, "refresh-flow-connector");
  assert.equal(plan.refreshes[0].batch.mode, "update");
  assert.deepEqual(plan.refreshes[0].record.start, recordA.start);
  assert.deepEqual(plan.refreshes[0].record.end, recordA.end);
  assert.equal(plan.refreshes[0].record.flowAction, "choose");
  assert.deepEqual(plan.refreshes[0].record.routeCache.points, routeA);
  assert.equal(plan.refreshes[0].record.updatedAt, "2026-05-10T01:00:00.000Z");
  assert.equal(plan.trunkLayout.groups.length, 1);
  assert.deepEqual(plan.trunkLayout.groups[0].connectorIds, ["connector-a", "connector-b"]);
  assert.equal(plan.renderConnectors.length, 2);
  assert.ok(plan.renderConnectors.every((connector) => connector.sharedTrunkSegment !== undefined));
});

test("excludes failed refresh targets from planned visual replacement", async () => {
  const core = await importCoreModule();
  const now = "2026-05-10T00:00:00.000Z";
  const successStart = endpoint("success-start", "Success Start", {
    x: 0,
    y: 260,
    width: 80,
    height: 80,
  });
  const successEnd = endpoint("success-end", "Success End", {
    x: 320,
    y: 260,
    width: 80,
    height: 80,
  });
  const blockedStart = endpoint("blocked-start", "Blocked Start", {
    x: 0,
    y: 0,
    width: 80,
    height: 80,
  });
  const blockedEnd = endpoint("blocked-end", "Blocked End", {
    x: 320,
    y: 0,
    width: 80,
    height: 80,
  });
  const previousRoute = [
    { x: 80, y: 40 },
    { x: 320, y: 40 },
  ];
  const successRecord = createRecord(core, {
    connectorId: "connector-success",
    end: successEnd,
    now,
    routePoints: previousRoute,
    start: successStart,
  });
  const blockedRecord = createRecord(core, {
    connectorId: "connector-blocked",
    end: blockedEnd,
    now,
    routePoints: previousRoute,
    start: blockedStart,
  });
  const blockingObstacles = [
    { id: "left-wall", kind: "context-frame", rect: { x: -60, y: -60, width: 50, height: 200 } },
    { id: "right-wall", kind: "context-frame", rect: { x: 80, y: -60, width: 50, height: 200 } },
    { id: "top-wall", kind: "context-frame", rect: { x: -60, y: -60, width: 190, height: 50 } },
    { id: "bottom-wall", kind: "context-frame", rect: { x: -60, y: 80, width: 190, height: 50 } },
  ];

  const plan = core.planFlowConnectorRouteLayoutSet({
    now: "2026-05-10T01:00:00.000Z",
    routeFacts: {
      connectors: [
        {
          end: blockedEnd,
          name: "Blocked Connector",
          nodeId: "connector-node-blocked",
          obstacles: blockingObstacles,
          record: blockedRecord,
          start: blockedStart,
        },
        {
          end: successEnd,
          name: "Successful Connector",
          nodeId: "connector-node-success",
          obstacles: [],
          record: successRecord,
          start: successStart,
        },
      ],
    },
  });

  assert.equal(plan.refreshes.length, 1);
  assert.equal(plan.refreshes[0].connectorNodeId, "connector-node-success");
  assert.deepEqual(
    plan.failures.map((failure) => [failure.connectorNodeId, failure.message]),
    [["connector-node-blocked", "No legal Orthogonal Route avoids Connector Obstacles."]],
  );
  assert.deepEqual(
    plan.renderConnectors.map((connector) => connector.connectorNodeId),
    ["connector-node-success"],
  );
  assert.notDeepEqual(plan.renderConnectors[0].routePoints, previousRoute);
});

test("reports route layout failures without planning failed visual replacement", async () => {
  const core = await importCoreModule();
  const now = "2026-05-10T00:00:00.000Z";
  const start = endpoint("start", "Start", { x: 0, y: 0, width: 80, height: 80 });
  const end = endpoint("end", "End", { x: 320, y: 0, width: 80, height: 80 });
  const previousRoute = [
    { x: 80, y: 40 },
    { x: 320, y: 40 },
  ];
  const record = createRecord(core, {
    connectorId: "connector-failing",
    end,
    now,
    routePoints: previousRoute,
    start,
  });
  const blockingObstacles = [
    { id: "left-wall", kind: "context-frame", rect: { x: -60, y: -60, width: 50, height: 200 } },
    { id: "right-wall", kind: "context-frame", rect: { x: 80, y: -60, width: 50, height: 200 } },
    { id: "top-wall", kind: "context-frame", rect: { x: -60, y: -60, width: 190, height: 50 } },
    { id: "bottom-wall", kind: "context-frame", rect: { x: -60, y: 80, width: 190, height: 50 } },
  ];

  const plan = core.planFlowConnectorRouteLayoutSet({
    now: "2026-05-10T01:00:00.000Z",
    routeFacts: {
      connectors: [
        {
          end,
          name: "Blocked Connector",
          nodeId: "connector-node",
          obstacles: blockingObstacles,
          record,
          start,
        },
        {
          name: "Missing Record Connector",
          nodeId: "missing-record-node",
          record: null,
        },
      ],
      selectedConnectorNodeIds: ["connector-node", "missing-record-node"],
    },
  });

  assert.equal(plan.refreshes.length, 0);
  assert.deepEqual(
    plan.failures.map((failure) => [failure.connectorNodeId, failure.message]),
    [
      ["connector-node", "No legal Orthogonal Route avoids Connector Obstacles."],
      ["missing-record-node", "Missing Flow Connector record."],
    ],
  );
  assert.deepEqual(plan.renderConnectors, []);
});

function endpoint(id, name, bounds) {
  return {
    bounds,
    contextFrameId: `${id}-context`,
    hasGeneratedAncestor: false,
    id,
    name,
  };
}

function createRecord(core, input) {
  return core.createFlowConnectorRecord({
    connectorId: input.connectorId,
    end: {
      contextFrameId: input.end.contextFrameId,
      nodeId: input.end.id,
    },
    flowAction: "choose",
    now: input.now,
    ownerContextFrameId: input.start.contextFrameId,
    routePoints: input.routePoints,
    start: {
      contextFrameId: input.start.contextFrameId,
      nodeId: input.start.id,
    },
  });
}

function finalSegment(points) {
  return {
    start: points[points.length - 2],
    end: points[points.length - 1],
  };
}
