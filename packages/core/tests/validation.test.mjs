import assert from 'node:assert/strict';
import { test } from 'node:test';

import { importCoreModule } from './helpers.mjs';

test('validates Flow Connector references by impact severity', async () => {
  const core = await importCoreModule();
  const now = '2026-05-09T00:00:00.000Z';
  const report = core.validateFlowConnectorReferences({
    endpoints: [
      {
        connectorIds: ['connector-duplicate-a', 'connector-duplicate-b', 'connector-stale'],
        isEligibleFlowEndpoint: true,
        nodeId: 'start-live',
      },
      {
        connectorIds: ['connector-duplicate-a', 'connector-duplicate-b'],
        isEligibleFlowEndpoint: true,
        nodeId: 'end-live',
      },
      {
        connectorIds: ['connector-invalid-endpoint'],
        isEligibleFlowEndpoint: false,
        nodeId: 'annotation-card-endpoint',
      },
      {
        connectorIds: ['connector-deleted-root'],
        isEligibleFlowEndpoint: true,
        nodeId: 'former-endpoint',
      },
    ],
    connectors: [
      {
        nodeId: 'connector-orphan-root',
        record: core.createFlowConnectorRecord({
          connectorId: 'connector-orphan',
          end: { contextFrameId: 'frame-1', nodeId: 'end-live' },
          flowAction: 'open',
          now,
          ownerContextFrameId: 'frame-1',
          start: { contextFrameId: 'frame-1', nodeId: 'deleted-start' },
        }),
      },
      {
        nodeId: 'connector-invalid-root',
        record: core.createFlowConnectorRecord({
          connectorId: 'connector-invalid-endpoint',
          end: { contextFrameId: 'frame-1', nodeId: 'end-live' },
          flowAction: 'open',
          now,
          ownerContextFrameId: 'frame-1',
          start: { contextFrameId: 'frame-1', nodeId: 'annotation-card-endpoint' },
        }),
      },
      {
        nodeId: 'connector-duplicate-root-a',
        record: core.createFlowConnectorRecord({
          connectorId: 'connector-duplicate-a',
          end: { contextFrameId: 'frame-1', nodeId: 'end-live' },
          flowAction: null,
          now,
          ownerContextFrameId: 'frame-1',
          start: { contextFrameId: 'frame-1', nodeId: 'start-live' },
        }),
      },
      {
        nodeId: 'connector-duplicate-root-b',
        record: core.createFlowConnectorRecord({
          connectorId: 'connector-duplicate-b',
          end: { contextFrameId: 'frame-1', nodeId: 'end-live' },
          flowAction: 'open',
          now,
          ownerContextFrameId: 'frame-1',
          start: { contextFrameId: 'frame-1', nodeId: 'start-live' },
        }),
      },
    ],
  });

  assert.deepEqual(report.summary, {
    all: 5,
    errors: 3,
    warnings: 2,
    info: 0,
  });
  assert.deepEqual(
    report.issues.map((issue) => [issue.code, issue.severity, issue.title]),
    [
      ['flow-connector-orphaned', 'error', 'Orphaned Flow Connector'],
      ['flow-endpoint-invalid', 'error', 'Invalid Flow Endpoint'],
      ['flow-connector-duplicate', 'error', 'Duplicate Flow Connector'],
      ['flow-action-empty', 'warning', 'Empty Flow Action'],
      ['connector-reverse-index-stale', 'warning', 'Stale Reverse Index'],
    ],
  );
  assert.deepEqual(
    report.issues.find((issue) => issue.code === 'flow-endpoint-invalid').locationNodeIds,
    ['connector-invalid-root', 'annotation-card-endpoint'],
  );
  assert.deepEqual(
    report.issues.find((issue) => issue.code === 'connector-reverse-index-stale').locationNodeIds,
    ['start-live', 'former-endpoint'],
  );
});

test('validates Flow Connector route, label, and refresh geometry', async () => {
  const core = await importCoreModule();
  const now = '2026-05-09T00:00:00.000Z';
  const crossingObstacle = { id: 'middle-frame', kind: 'context-frame', rect: { x: 180, y: 0, width: 120, height: 120 } };
  const crossingRecord = core.createFlowConnectorRecord({
    connectorId: 'connector-crossing',
    end: { contextFrameId: 'context', nodeId: 'end-crossing' },
    flowAction: 'cross',
    now,
    ownerContextFrameId: 'context',
    routePoints: [
      { x: 100, y: 50 },
      { x: 380, y: 50 },
    ],
    start: { contextFrameId: 'context', nodeId: 'start-crossing' },
  });
  const routingFailureRecord = core.createFlowConnectorRecord({
    connectorId: 'connector-failure',
    end: { contextFrameId: 'context', nodeId: 'end-failure' },
    flowAction: 'fail',
    now,
    ownerContextFrameId: 'context',
    start: { contextFrameId: 'context', nodeId: 'start-failure' },
  });
  const refreshableRecord = core.createFlowConnectorRecord({
    connectorId: 'connector-refreshable',
    end: { contextFrameId: 'context', nodeId: 'end-refreshable' },
    flowAction: 'refresh',
    now,
    ownerContextFrameId: 'context',
    routePoints: [
      { x: 100, y: 50 },
      { x: 180, y: 50 },
      { x: 180, y: 220 },
      { x: 300, y: 220 },
    ],
    start: { contextFrameId: 'context', nodeId: 'start-refreshable' },
  });
  const firstLabelRecord = core.createFlowConnectorRecord({
    connectorId: 'connector-label-a',
    end: { contextFrameId: 'context', nodeId: 'end-label-a' },
    flowAction: 'A',
    now,
    ownerContextFrameId: 'context',
    routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    start: { contextFrameId: 'context', nodeId: 'start-label-a' },
  });
  const secondLabelRecord = core.createFlowConnectorRecord({
    connectorId: 'connector-label-b',
    end: { contextFrameId: 'context', nodeId: 'end-label-b' },
    flowAction: 'B',
    now,
    ownerContextFrameId: 'context',
    routePoints: [{ x: 0, y: 24 }, { x: 100, y: 24 }],
    start: { contextFrameId: 'context', nodeId: 'start-label-b' },
  });

  const report = core.validateFlowConnectorRouteGeometry({
    connectors: [
      {
        nodeId: 'connector-crossing-root',
        obstacles: [crossingObstacle],
        record: crossingRecord,
      },
      {
        endRect: { x: 320, y: 0, width: 80, height: 80 },
        nodeId: 'connector-failure-root',
        obstacles: [
          { id: 'left-wall', kind: 'context-frame', rect: { x: -60, y: -60, width: 50, height: 200 } },
          { id: 'right-wall', kind: 'context-frame', rect: { x: 80, y: -60, width: 50, height: 200 } },
          { id: 'top-wall', kind: 'context-frame', rect: { x: -60, y: -60, width: 190, height: 50 } },
          { id: 'bottom-wall', kind: 'context-frame', rect: { x: -60, y: 80, width: 190, height: 50 } },
        ],
        record: routingFailureRecord,
        startRect: { x: 0, y: 0, width: 80, height: 80 },
      },
      {
        endRect: { x: 420, y: 160, width: 100, height: 100 },
        nodeId: 'connector-refreshable-root',
        obstacles: [],
        record: refreshableRecord,
        startRect: { x: 0, y: 0, width: 100, height: 100 },
      },
      {
        labelRect: { x: 120, y: 80, width: 80, height: 28 },
        nodeId: 'connector-label-root-a',
        obstacles: [],
        record: firstLabelRecord,
      },
      {
        labelRect: { x: 180, y: 90, width: 80, height: 28 },
        nodeId: 'connector-label-root-b',
        obstacles: [],
        record: secondLabelRecord,
      },
    ],
  });

  assert.deepEqual(report.summary, {
    all: 4,
    errors: 2,
    warnings: 1,
    info: 1,
  });
  assert.deepEqual(
    report.issues.map((issue) => [issue.code, issue.severity, issue.title]),
    [
      ['connector-route-crosses-obstacle', 'error', 'Connector Route Crosses Obstacle'],
      ['connector-routing-failure', 'error', 'Connector Routing Failure'],
      ['flow-action-label-overlap', 'warning', 'Flow Action Label Overlap'],
      ['connector-route-refreshable', 'info', 'Connector Route Can Be Refreshed'],
    ],
  );
  assert.deepEqual(
    report.issues.find((issue) => issue.code === 'flow-action-label-overlap').locationNodeIds,
    ['connector-label-root-a', 'connector-label-root-b'],
  );
  assert.deepEqual(
    report.issues.find((issue) => issue.code === 'connector-route-crosses-obstacle').locationNodeIds,
    ['connector-crossing-root'],
  );
  assert.deepEqual(
    report.issues.find((issue) => issue.code === 'connector-routing-failure').locationNodeIds,
    ['connector-failure-root'],
  );
  assert.deepEqual(
    report.issues.find((issue) => issue.code === 'connector-route-refreshable').locationNodeIds,
    ['connector-refreshable-root'],
  );
});

test('validates Connector Trunk missing and unexpected anomalies', async () => {
  const core = await importCoreModule();
  const now = '2026-05-09T00:00:00.000Z';
  const missingA = core.createFlowConnectorRecord({
    connectorId: 'connector-missing-a',
    end: { contextFrameId: 'context', nodeId: 'shared-end' },
    flowAction: 'A',
    now,
    ownerContextFrameId: 'context',
    routePoints: [{ x: 80, y: 20 }, { x: 320, y: 20 }, { x: 400, y: 20 }],
    start: { contextFrameId: 'context', nodeId: 'start-a' },
  });
  const missingB = core.createFlowConnectorRecord({
    connectorId: 'connector-missing-b',
    end: { contextFrameId: 'context', nodeId: 'shared-end' },
    flowAction: 'B',
    now,
    ownerContextFrameId: 'context',
    routePoints: [{ x: 80, y: 80 }, { x: 340, y: 80 }, { x: 400, y: 80 }],
    start: { contextFrameId: 'context', nodeId: 'start-b' },
  });
  const unexpectedA = core.createFlowConnectorRecord({
    connectorId: 'connector-unexpected-a',
    end: { contextFrameId: 'context', nodeId: 'end-a' },
    flowAction: 'C',
    now,
    ownerContextFrameId: 'context',
    routePoints: [{ x: 80, y: 160 }, { x: 320, y: 160 }, { x: 400, y: 160 }],
    start: { contextFrameId: 'context', nodeId: 'start-c' },
  });
  const unexpectedB = core.createFlowConnectorRecord({
    connectorId: 'connector-unexpected-b',
    end: { contextFrameId: 'context', nodeId: 'end-b' },
    flowAction: 'D',
    now,
    ownerContextFrameId: 'context',
    routePoints: [{ x: 80, y: 220 }, { x: 320, y: 160 }, { x: 400, y: 160 }],
    start: { contextFrameId: 'context', nodeId: 'start-d' },
  });

  const report = core.validateFlowConnectorRouteGeometry({
    connectors: [
      { nodeId: 'connector-missing-root-a', obstacles: [], record: missingA },
      { nodeId: 'connector-missing-root-b', obstacles: [], record: missingB },
      { nodeId: 'connector-unexpected-root-a', obstacles: [], record: unexpectedA },
      { nodeId: 'connector-unexpected-root-b', obstacles: [], record: unexpectedB },
    ],
  });

  assert.deepEqual(
    report.issues.map((issue) => [issue.code, issue.severity]),
    [
      ['connector-trunk-missing', 'warning'],
      ['connector-trunk-unexpected', 'error'],
    ],
  );
  assert.deepEqual(
    report.issues.find((issue) => issue.code === 'connector-trunk-missing').locationNodeIds,
    ['connector-missing-root-a', 'connector-missing-root-b'],
  );
  assert.deepEqual(
    report.issues.find((issue) => issue.code === 'connector-trunk-unexpected').locationNodeIds,
    ['connector-unexpected-root-a', 'connector-unexpected-root-b'],
  );
});

test('plans Clean Stale Indexes without rebuilding or rebinding Flow Connectors', async () => {
  const core = await importCoreModule();
  const plan = core.buildCleanStaleIndexesPlan({
    liveConnectorIds: ['connector-live', 'connector-semantic-invalid'],
    endpoints: [
      {
        connectorIds: ['connector-live', 'connector-deleted', 'connector-semantic-invalid'],
        isEligibleFlowEndpoint: true,
        nodeId: 'endpoint-a',
      },
      {
        connectorIds: ['connector-live'],
        isEligibleFlowEndpoint: true,
        nodeId: 'endpoint-b',
      },
    ],
  });

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.kind, 'clean-stale-indexes');
  assert.deepEqual(plan.cleanedEndpointNodeIds, ['endpoint-a']);
  assert.deepEqual(plan.removedConnectorIds, ['connector-deleted']);
  assert.deepEqual(
    plan.operations.map((operation) => operation.type),
    ['set-shared-plugin-data'],
  );
  assert.deepEqual(plan.operations[0], {
    type: 'set-shared-plugin-data',
    target: { kind: 'existing-node', nodeId: 'endpoint-a' },
    key: 'connectorRefs',
    value: {
      schemaVersion: 1,
      connectorIds: ['connector-live', 'connector-semantic-invalid'],
    },
  });
});

test('validates Annotation bindings by impact severity without repair plans', async () => {
  const core = await importCoreModule();
  const report = core.validateAnnotationBindings({
    contexts: [
      { nodeId: 'context-1', rect: { x: 0, y: 0, width: 320, height: 180 } },
    ],
    subjects: [
      {
        annotationIds: ['annotation-missing-card'],
        nodeId: 'subject-1',
        rect: { x: 20, y: 24, width: 100, height: 50 },
      },
      {
        annotationIds: ['annotation-missing-badge'],
        nodeId: 'subject-2',
        rect: { x: 160, y: 24, width: 100, height: 50 },
      },
    ],
    cards: [
      {
        nodeId: 'card-missing-body',
        rect: { x: 0, y: 220, width: 280, height: 100 },
        record: {
          id: 'annotation-missing-body',
          annotationNumber: 1,
          body: '  ',
          contextFrameId: 'context-1',
          subjectNodeIds: ['subject-1'],
        },
      },
      {
        nodeId: 'card-missing-badge',
        rect: { x: 20, y: 340, width: 280, height: 100 },
        record: {
          id: 'annotation-missing-badge',
          annotationNumber: 3,
          body: 'Requires a badge.',
          contextFrameId: 'context-1',
          subjectNodeIds: ['subject-2'],
        },
      },
      {
        nodeId: 'card-orphan-context',
        rect: { x: 0, y: 460, width: 280, height: 100 },
        record: {
          id: 'annotation-orphan-context',
          annotationNumber: 2,
          body: 'Missing context.',
          contextFrameId: 'context-deleted',
          subjectNodeIds: ['subject-1'],
        },
      },
      {
        nodeId: 'card-outside',
        rect: { x: 0, y: 190, width: 280, height: 100 },
        record: {
          id: 'annotation-outside',
          annotationNumber: 4,
          body: 'Too high.',
          contextFrameId: 'context-1',
          subjectNodeIds: ['subject-1'],
        },
      },
    ],
    badges: [
      {
        nodeId: 'badge-1a',
        rect: { x: 106, y: 10, width: 28, height: 28 },
        record: {
          schemaVersion: 1,
          annotationId: 'annotation-missing-body',
          annotationNumber: 1,
          contextFrameId: 'context-1',
          subjectNodeId: 'subject-1',
        },
      },
      {
        nodeId: 'badge-1b',
        rect: { x: 200, y: 10, width: 28, height: 28 },
        record: {
          schemaVersion: 1,
          annotationId: 'annotation-missing-body',
          annotationNumber: 1,
          contextFrameId: 'context-1',
          subjectNodeId: 'subject-1',
        },
      },
    ],
  });

  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.summary, {
    all: 7,
    errors: 2,
    warnings: 3,
    info: 2,
  });
  assert.deepEqual(
    report.issues.map((issue) => [issue.code, issue.severity]),
    [
      ['annotation-missing-badge', 'warning'],
      ['annotation-duplicate-badge', 'warning'],
      ['annotation-orphaned', 'error'],
      ['annotation-missing-body', 'error'],
      ['annotation-card-outside-design-notes-area', 'warning'],
      ['annotation-cards-unsorted', 'info'],
      ['annotation-badges-unarranged', 'info'],
    ],
  );
  assert.ok(report.issues.every((issue) => issue.locationNodeIds.length > 0));
});
