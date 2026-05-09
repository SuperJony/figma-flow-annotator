import assert from "node:assert/strict";
import { test } from "node:test";

import { importCoreModule } from "../support/helpers.mjs";

test("routes horizontal Context Frames around a middle Connector Obstacle", async () => {
  const core = await importCoreModule();
  const middleFrame = { x: 180, y: 0, width: 120, height: 100 };
  const result = core.routeOrthogonalConnector({
    startRect: { x: 0, y: 0, width: 100, height: 100 },
    endRect: { x: 380, y: 0, width: 100, height: 100 },
    obstacles: [
      {
        id: "frame-2",
        kind: "context-frame",
        rect: middleFrame,
      },
    ],
    preferredStartSide: "right",
    preferredEndSide: "left",
  });

  assert.deepEqual(Object.keys(result), ["points"]);
  assert.ok(result.points.length >= 4);
  assert.equal(routeIsOrthogonal(result.points), true);
  assert.equal(routeIntersectsRect(result.points, expandRect(middleFrame, 24)), false);
  assert.deepEqual(result.points[0], { x: 100, y: 50 });
  assert.deepEqual(result.points.at(-1), { x: 380, y: 50 });
});

test("routes around Annotation Cards and fails when no legal route exists", async () => {
  const core = await importCoreModule();
  const annotationCard = { x: 170, y: 66, width: 120, height: 100 };
  const success = core.routeOrthogonalConnector({
    startRect: { x: 0, y: 80, width: 100, height: 80 },
    endRect: { x: 360, y: 80, width: 100, height: 80 },
    obstacles: [
      {
        id: "card-1",
        kind: "annotation-card",
        rect: annotationCard,
      },
    ],
  });

  assert.equal(routeIsOrthogonal(success.points), true);
  assert.equal(routeIntersectsRect(success.points, expandRect(annotationCard, 24)), false);
  assert.throws(
    () =>
      core.routeOrthogonalConnector({
        startRect: { x: 0, y: 0, width: 80, height: 80 },
        endRect: { x: 320, y: 0, width: 80, height: 80 },
        obstacles: [
          {
            id: "left-wall",
            kind: "context-frame",
            rect: { x: -60, y: -60, width: 50, height: 200 },
          },
          {
            id: "right-wall",
            kind: "context-frame",
            rect: { x: 80, y: -60, width: 50, height: 200 },
          },
          {
            id: "top-wall",
            kind: "context-frame",
            rect: { x: -60, y: -60, width: 190, height: 50 },
          },
          {
            id: "bottom-wall",
            kind: "context-frame",
            rect: { x: -60, y: 80, width: 190, height: 50 },
          },
        ],
      }),
    (error) => error instanceof core.ConnectorRouteFailure && error.code === "no-legal-route",
  );
});

test("places Flow Action labels on the longest readable segment near route center", async () => {
  const core = await importCoreModule();
  const routePoints = [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 40 },
    { x: 240, y: 40 },
    { x: 240, y: 90 },
    { x: 360, y: 90 },
  ];

  const unrestricted = core.placeFlowActionLabel({
    flowAction: "Approve scope",
    routePoints,
  });
  assert.deepEqual(unrestricted, {
    center: { x: 160, y: 40 },
    segmentIndex: 2,
  });

  const obstacleAware = core.placeFlowActionLabel({
    flowAction: "Approve scope",
    obstacles: [
      { id: "card-1", kind: "annotation-card", rect: { x: 120, y: 24, width: 80, height: 48 } },
    ],
    routePoints,
  });
  assert.deepEqual(obstacleAware, {
    center: { x: 300, y: 90 },
    segmentIndex: 4,
  });
});

test("groups same-end same-incoming-side connectors into deterministic trunks", async () => {
  const core = await importCoreModule();
  const now = "2026-05-09T00:00:00.000Z";
  const trunkSegment = {
    end: { x: 400, y: 50 },
    index: 3,
    length: 32,
    start: { x: 368, y: 50 },
  };
  const firstRecord = core.createFlowConnectorRecord({
    connectorId: "connector-a",
    end: { contextFrameId: "frame-end", nodeId: "end" },
    flowAction: "choose A",
    now,
    ownerContextFrameId: "frame-start-a",
    routePoints: [
      { x: 100, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 50 },
      trunkSegment.start,
      trunkSegment.end,
    ],
    start: { contextFrameId: "frame-start-a", nodeId: "start-a" },
  });
  const secondRecord = core.createFlowConnectorRecord({
    connectorId: "connector-b",
    end: { contextFrameId: "frame-end", nodeId: "end" },
    flowAction: "choose B",
    now,
    ownerContextFrameId: "frame-start-b",
    routePoints: [
      { x: 100, y: 120 },
      { x: 200, y: 120 },
      { x: 200, y: 50 },
      trunkSegment.start,
      trunkSegment.end,
    ],
    start: { contextFrameId: "frame-start-b", nodeId: "start-b" },
  });

  const batch = core.groupConnectorTrunks({
    connectors: [{ record: secondRecord }, { record: firstRecord }],
  });

  assert.equal(batch.groups.length, 1);
  assert.equal(batch.groups[0].endNodeId, "end");
  assert.equal(batch.groups[0].incomingSide, "left");
  assert.deepEqual(batch.groups[0].connectorIds, ["connector-a", "connector-b"]);
  assert.deepEqual(batch.groups[0].segment, trunkSegment);

  const placement = core.placeFlowActionLabel({
    flowAction: "choose B",
    routePoints: secondRecord.routeCache.points,
    sharedTrunkSegment: batch.groups[0].segment,
  });
  assert.notEqual(placement.segmentIndex, trunkSegment.index);
  assert.notDeepEqual(placement.center, { x: 384, y: 50 });
});

test("does not group Connector Trunks across different ends or opposite directions", async () => {
  const core = await importCoreModule();
  const now = "2026-05-09T00:00:00.000Z";
  const base = {
    flowAction: "choose",
    now,
    ownerContextFrameId: "frame-start",
  };
  const first = core.createFlowConnectorRecord({
    ...base,
    connectorId: "connector-a",
    end: { contextFrameId: "frame-end", nodeId: "end-a" },
    routePoints: [
      { x: 0, y: 0 },
      { x: 68, y: 0 },
      { x: 100, y: 0 },
    ],
    start: { contextFrameId: "frame-start", nodeId: "start-a" },
  });
  const differentEnd = core.createFlowConnectorRecord({
    ...base,
    connectorId: "connector-b",
    end: { contextFrameId: "frame-end", nodeId: "end-b" },
    routePoints: [
      { x: 0, y: 20 },
      { x: 68, y: 20 },
      { x: 100, y: 20 },
    ],
    start: { contextFrameId: "frame-start", nodeId: "start-b" },
  });
  const oppositeDirection = core.createFlowConnectorRecord({
    ...base,
    connectorId: "connector-c",
    end: { contextFrameId: "frame-start", nodeId: "start-a" },
    routePoints: [
      { x: 100, y: 0 },
      { x: 32, y: 0 },
      { x: 0, y: 0 },
    ],
    start: { contextFrameId: "frame-end", nodeId: "end-a" },
  });

  assert.equal(
    core.groupConnectorTrunks({
      connectors: [{ record: first }, { record: differentEnd }, { record: oppositeDirection }],
    }).groups.length,
    0,
  );
});

function routeIsOrthogonal(points) {
  return points.every((point, index) => {
    if (index === points.length - 1) {
      return true;
    }
    const next = points[index + 1];
    return point.x === next.x || point.y === next.y;
  });
}

function routeIntersectsRect(points, rect) {
  return points.some((point, index) => {
    if (index === points.length - 1) {
      return false;
    }
    return segmentIntersectsRect(point, points[index + 1], rect);
  });
}

function segmentIntersectsRect(start, end, rect) {
  if (start.y === end.y) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return (
      start.y >= rect.y &&
      start.y <= rect.y + rect.height &&
      maxX >= rect.x &&
      minX <= rect.x + rect.width
    );
  }
  if (start.x === end.x) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return (
      start.x >= rect.x &&
      start.x <= rect.x + rect.width &&
      maxY >= rect.y &&
      minY <= rect.y + rect.height
    );
  }
  return true;
}

function expandRect(rect, padding) {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}
