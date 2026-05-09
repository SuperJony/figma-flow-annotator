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

async function importCoreModule() {
  return import(`${resolve(packageRoot, 'src/index.ts')}?cache=${Date.now()}-${Math.random()}`);
}
