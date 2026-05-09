import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('exports shared plugin data namespace and key conventions', async () => {
  const core = await importCoreModule();

  assert.equal(core.SHARED_PLUGIN_DATA.namespace, 'figma_flow_annotator');
  assert.deepEqual(Object.values(core.SHARED_PLUGIN_DATA.keys), [
    'kind',
    'annotation',
    'badgeRef',
    'connector',
    'annotationRefs',
    'connectorRefs',
    'context',
  ]);
});

test('builds v1 Annotation records and a Document Change Plan shape', async () => {
  const core = await importCoreModule();
  const plan = core.buildCreateAnnotationPlan({
    annotationId: 'annotation-1',
    annotationNumber: 3,
    body: '  Explain this state.  ',
    contextFrameId: 'frame-1',
    now: '2026-05-09T00:00:00.000Z',
    subjects: [
      {
        bounds: { x: 10, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: 'subject-1',
        name: 'Primary Button',
      },
      {
        bounds: { x: 150, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 1,
        id: 'subject-2',
        name: 'Secondary Button',
      },
    ],
  });

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.kind, 'create-annotation');
  assert.equal(plan.record.schemaVersion, 1);
  assert.equal(plan.record.body, 'Explain this state.');
  assert.deepEqual(plan.record.subjectNodeIds, ['subject-1', 'subject-2']);
  assert.equal(plan.badgeCount, 2);
  assert.ok(plan.operations.some((operation) => operation.type === 'create-annotation-card'));
  assert.equal(
    plan.operations.filter((operation) => operation.type === 'append-shared-reference').length,
    2,
  );
});

test('builds Annotation maintenance plans with stable numbers and badge dedupe', async () => {
  const core = await importCoreModule();
  const plan = core.buildAddAnnotationSubjectsPlan({
    annotation: {
      schemaVersion: 1,
      id: 'annotation-1',
      annotationNumber: 8,
      body: 'Existing body',
      contextFrameId: 'frame-1',
      subjectNodeIds: ['subject-1'],
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
    },
    annotationCardNodeId: 'card-1',
    existingBadgeSubjectNodeIds: ['subject-1', 'subject-3'],
    now: '2026-05-09T00:00:00.000Z',
    subjects: [
      {
        bounds: { x: 10, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 1,
        id: 'subject-1',
        name: 'Already bound',
      },
      {
        bounds: { x: 160, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: 'subject-2',
        name: 'New subject',
      },
      {
        bounds: { x: 310, y: 20, width: 100, height: 50 },
        existingAnnotationRefCount: 0,
        id: 'subject-3',
        name: 'New but already badged',
      },
    ],
  });

  assert.equal(plan.kind, 'add-annotation-subjects');
  assert.equal(plan.annotationNumber, 8);
  assert.deepEqual(plan.record.subjectNodeIds, ['subject-1', 'subject-2', 'subject-3']);
  assert.equal(plan.record.body, 'Existing body');
  assert.equal(plan.badgeCount, 1);
  assert.deepEqual(plan.addedSubjectNodeIds, ['subject-2', 'subject-3']);
  assert.equal(
    plan.operations.filter((operation) => operation.type === 'create-annotation-badge').length,
    1,
  );
  assert.equal(
    plan.operations.filter((operation) => operation.type === 'append-shared-reference').length,
    2,
  );
});

test('builds explicit badge and card arrange plans by Annotation Number', async () => {
  const core = await importCoreModule();
  const badgePlan = core.buildArrangeAnnotationBadgesPlan({
    subjects: [
      {
        bounds: { x: 100, y: 40, width: 80, height: 48 },
        badges: [
          { annotationNumber: 9, nodeId: 'badge-9' },
          { annotationNumber: 2, nodeId: 'badge-2' },
        ],
        id: 'subject-1',
      },
    ],
  });
  const cardPlan = core.buildArrangeAnnotationCardsPlan({
    basePosition: { x: 20, y: 200 },
    cards: [
      { annotationNumber: 5, nodeId: 'card-5', rect: { x: 90, y: 90, width: 280, height: 120 } },
      { annotationNumber: 1, nodeId: 'card-1', rect: { x: 30, y: 60, width: 280, height: 100 } },
    ],
  });

  assert.equal(badgePlan.kind, 'arrange-annotation-badges');
  assert.deepEqual(badgePlan.movedBadgeNodeIds, ['badge-2', 'badge-9']);
  assert.deepEqual(
    badgePlan.operations.map((operation) => operation.position),
    [
      { x: 166, y: 26 },
      { x: 198, y: 26 },
    ],
  );
  assert.equal(cardPlan.kind, 'arrange-annotation-cards');
  assert.deepEqual(cardPlan.movedCardNodeIds, ['card-1', 'card-5']);
  assert.deepEqual(
    cardPlan.operations.map((operation) => operation.position),
    [
      { x: 20, y: 200 },
      { x: 20, y: 316 },
    ],
  );
});

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

test('routes horizontal Context Frames around a middle Connector Obstacle', async () => {
  const core = await importCoreModule();
  const middleFrame = { x: 180, y: 0, width: 120, height: 100 };
  const result = core.routeOrthogonalConnector({
    startRect: { x: 0, y: 0, width: 100, height: 100 },
    endRect: { x: 380, y: 0, width: 100, height: 100 },
    obstacles: [
      {
        id: 'frame-2',
        kind: 'context-frame',
        rect: middleFrame,
      },
    ],
    preferredStartSide: 'right',
    preferredEndSide: 'left',
  });

  assert.deepEqual(Object.keys(result), ['points']);
  assert.ok(result.points.length >= 4);
  assert.equal(routeIsOrthogonal(result.points), true);
  assert.equal(routeIntersectsRect(result.points, expandRect(middleFrame, 24)), false);
  assert.deepEqual(result.points[0], { x: 100, y: 50 });
  assert.deepEqual(result.points.at(-1), { x: 380, y: 50 });
});

test('routes around Annotation Cards and fails when no legal route exists', async () => {
  const core = await importCoreModule();
  const annotationCard = { x: 170, y: 66, width: 120, height: 100 };
  const success = core.routeOrthogonalConnector({
    startRect: { x: 0, y: 80, width: 100, height: 80 },
    endRect: { x: 360, y: 80, width: 100, height: 80 },
    obstacles: [
      {
        id: 'card-1',
        kind: 'annotation-card',
        rect: annotationCard,
      },
    ],
  });

  assert.equal(routeIsOrthogonal(success.points), true);
  assert.equal(routeIntersectsRect(success.points, expandRect(annotationCard, 24)), false);
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

async function importCoreModule() {
  return import(`${resolve(packageRoot, 'src/index.ts')}?cache=${Date.now()}-${Math.random()}`);
}

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
    return start.y >= rect.y && start.y <= rect.y + rect.height && maxX >= rect.x && minX <= rect.x + rect.width;
  }
  if (start.x === end.x) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return start.x >= rect.x && start.x <= rect.x + rect.width && maxY >= rect.y && minY <= rect.y + rect.height;
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
