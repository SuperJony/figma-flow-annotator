import assert from 'node:assert/strict';
import { test } from 'node:test';

import { importCoreModule } from './helpers.mjs';

test('builds v1 Flow Connector records and directed plan naming', async () => {
  const core = await importCoreModule();
  const plan = core.buildCreateFlowConnectorPlan({
    connectorId: 'connector-1',
    end: {
      contextFrameId: 'frame-2',
      id: 'end-node',
      name: 'End',
    },
    flowAction: ' click ',
    now: '2026-05-09T00:00:00.000Z',
    ownerContextFrameId: 'frame-1',
    routePoints: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    start: {
      contextFrameId: 'frame-1',
      id: 'start-node',
      name: 'Start',
    },
  });

  assert.equal(plan.kind, 'create-flow-connector');
  assert.equal(plan.mode, 'create');
  assert.equal(plan.record.schemaVersion, 1);
  assert.equal(plan.record.flowAction, 'click');
  assert.deepEqual(plan.record.routeCache.points, [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]);
  assert.ok(
    plan.operations.some(
      (operation) =>
        operation.type === 'create-flow-connector' &&
        operation.name === 'FFA Connector Start -> End',
    ),
  );
});

test('upserts Flow Connectors by directed endpoint pair and keeps reverse direction independent', async () => {
  const core = await importCoreModule();
  const existingRecord = core.createFlowConnectorRecord({
    connectorId: 'connector-existing',
    createdAt: '2026-05-08T00:00:00.000Z',
    end: {
      contextFrameId: 'frame-b',
      nodeId: 'node-b',
    },
    flowAction: 'click',
    now: '2026-05-08T01:00:00.000Z',
    ownerContextFrameId: 'frame-a',
    routePoints: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    start: {
      contextFrameId: 'frame-a',
      nodeId: 'node-a',
    },
  });

  assert.equal(core.flowConnectorMatchesDirectedPair(existingRecord, 'node-a', 'node-b'), true);
  assert.equal(core.flowConnectorMatchesDirectedPair(existingRecord, 'node-b', 'node-a'), false);

  const unchanged = core.buildCreateFlowConnectorPlan({
    connectorId: 'connector-unused',
    existingConnector: {
      nodeId: 'connector-node',
      record: existingRecord,
    },
    end: {
      contextFrameId: 'frame-b',
      id: 'node-b',
      name: 'B',
    },
    flowAction: ' click ',
    now: '2026-05-09T00:00:00.000Z',
    ownerContextFrameId: 'frame-a',
    routePoints: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    start: {
      contextFrameId: 'frame-a',
      id: 'node-a',
      name: 'A',
    },
  });

  assert.equal(unchanged.mode, 'idempotent');
  assert.equal(unchanged.connectorId, 'connector-existing');
  assert.deepEqual(unchanged.operations, []);
  assert.equal(unchanged.record.updatedAt, existingRecord.updatedAt);

  const changed = core.buildCreateFlowConnectorPlan({
    connectorId: 'connector-unused',
    existingConnector: {
      nodeId: 'connector-node',
      record: existingRecord,
    },
    end: {
      contextFrameId: 'frame-b',
      id: 'node-b',
      name: 'B',
    },
    flowAction: '',
    now: '2026-05-09T00:00:00.000Z',
    ownerContextFrameId: 'frame-a',
    routePoints: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    start: {
      contextFrameId: 'frame-a',
      id: 'node-a',
      name: 'A',
    },
  });

  assert.equal(changed.mode, 'update');
  assert.equal(changed.connectorId, 'connector-existing');
  assert.equal(changed.record.id, 'connector-existing');
  assert.equal(changed.record.createdAt, existingRecord.createdAt);
  assert.equal(changed.record.updatedAt, '2026-05-09T00:00:00.000Z');
  assert.equal(changed.record.flowAction, null);
  assert.deepEqual(
    changed.operations.map((operation) => operation.type),
    ['update-flow-connector', 'set-shared-plugin-data'],
  );
  assert.throws(
    () => core.buildCreateFlowConnectorPlan({
      connectorId: 'connector-unused',
      existingConnector: {
        nodeId: 'connector-node',
        record: existingRecord,
      },
      end: {
        contextFrameId: 'frame-a',
        id: 'node-a',
        name: 'A',
      },
      flowAction: 'click',
      now: '2026-05-09T00:00:00.000Z',
      ownerContextFrameId: 'frame-b',
      routePoints: [
        { x: 100, y: 0 },
        { x: 0, y: 0 },
      ],
      start: {
        contextFrameId: 'frame-b',
        id: 'node-b',
        name: 'B',
      },
    }),
    /does not match the directed endpoint pair/,
  );

  const reverse = core.buildCreateFlowConnectorPlan({
    connectorId: 'connector-reverse',
    end: {
      contextFrameId: 'frame-a',
      id: 'node-a',
      name: 'A',
    },
    flowAction: '',
    now: '2026-05-09T00:00:00.000Z',
    ownerContextFrameId: 'frame-b',
    routePoints: [
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ],
    start: {
      contextFrameId: 'frame-b',
      id: 'node-b',
      name: 'B',
    },
  });

  assert.equal(reverse.mode, 'create');
  assert.equal(reverse.connectorId, 'connector-reverse');
  assert.deepEqual(
    reverse.operations.filter((operation) => operation.type === 'append-shared-reference').map((operation) => operation.targetNodeId),
    ['node-b', 'node-a'],
  );
});

test('builds explicit Flow Connector refresh plans without changing semantics', async () => {
  const core = await importCoreModule();
  const existingRecord = core.createFlowConnectorRecord({
    connectorId: 'connector-existing',
    createdAt: '2026-05-08T00:00:00.000Z',
    end: {
      contextFrameId: 'frame-b',
      nodeId: 'node-b',
    },
    flowAction: 'choose',
    now: '2026-05-08T01:00:00.000Z',
    ownerContextFrameId: 'frame-a',
    routePoints: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    start: {
      contextFrameId: 'frame-a',
      nodeId: 'node-a',
    },
  });
  const refreshed = core.buildRefreshFlowConnectorPlan({
    connectorNodeId: 'connector-node',
    endName: 'End',
    now: '2026-05-09T00:00:00.000Z',
    record: existingRecord,
    routePoints: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 80 },
    ],
    startName: 'Start',
  });

  assert.equal(refreshed.kind, 'refresh-flow-connector');
  assert.equal(refreshed.mode, 'update');
  assert.equal(refreshed.connectorId, 'connector-existing');
  assert.deepEqual(refreshed.record.start, existingRecord.start);
  assert.deepEqual(refreshed.record.end, existingRecord.end);
  assert.equal(refreshed.record.ownerContextFrameId, existingRecord.ownerContextFrameId);
  assert.equal(refreshed.record.flowAction, existingRecord.flowAction);
  assert.equal(refreshed.record.createdAt, existingRecord.createdAt);
  assert.equal(refreshed.record.updatedAt, '2026-05-09T00:00:00.000Z');
  assert.deepEqual(refreshed.record.routeCache.points, [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 80 },
  ]);
  assert.deepEqual(
    refreshed.operations.map((operation) => operation.type),
    ['update-flow-connector', 'set-shared-plugin-data'],
  );

  const idempotent = core.buildRefreshFlowConnectorPlan({
    connectorNodeId: 'connector-node',
    endName: 'End',
    now: '2026-05-09T00:00:00.000Z',
    record: existingRecord,
    routePoints: existingRecord.routeCache.points,
    startName: 'Start',
  });

  assert.equal(idempotent.mode, 'idempotent');
  assert.deepEqual(idempotent.operations, []);
  assert.equal(idempotent.record.updatedAt, existingRecord.updatedAt);
  assert.throws(
    () => core.routeOrthogonalConnector({
      startRect: { x: 0, y: 0, width: 80, height: 80 },
      endRect: { x: 320, y: 0, width: 80, height: 80 },
      obstacles: [
        { id: 'left-wall', kind: 'context-frame', rect: { x: -60, y: -60, width: 50, height: 200 } },
        { id: 'right-wall', kind: 'context-frame', rect: { x: 80, y: -60, width: 50, height: 200 } },
        { id: 'top-wall', kind: 'context-frame', rect: { x: -60, y: -60, width: 190, height: 50 } },
        { id: 'bottom-wall', kind: 'context-frame', rect: { x: -60, y: 80, width: 190, height: 50 } },
      ],
    }),
    (error) => error instanceof core.ConnectorRouteFailure && error.code === 'no-legal-route',
  );
  assert.deepEqual(existingRecord.routeCache.points, [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]);
});

