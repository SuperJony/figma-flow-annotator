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

async function importCoreModule() {
  return import(`${resolve(packageRoot, 'src/index.ts')}?cache=${Date.now()}-${Math.random()}`);
}
