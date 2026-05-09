import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = resolve(appRoot, '.test-build');

test('replaces a stale Flow Endpoint window after Figma duplicate selection', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const originalStart = createNode(page, 'original-start', 0);
    const originalEnd = createNode(page, 'original-end', 160);
    const copyStart = createNode(page, 'copy-start', 320);
    const copyEnd = createNode(page, 'copy-end', 480);
    const runtime = createRuntime(page);

    page.children = [originalStart, originalEnd, copyStart, copyEnd];
    globalThis.figma = { currentPage: page };

    connect.resetObservedEndpointSelection(runtime);

    page.selection = [originalStart];
    connect.handleSelectionChange(runtime);
    page.selection = [originalStart, originalEnd];
    connect.handleSelectionChange(runtime);
    assert.deepEqual(getPendingEndpointIds(connect, runtime), ['original-start', 'original-end']);

    page.selection = [copyStart, copyEnd];
    connect.handleSelectionChange(runtime);
    assert.deepEqual(getPendingEndpointIds(connect, runtime), ['copy-start', 'copy-end']);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('creates a Flow Connector on duplicated selected endpoints, not the originals', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const originalStart = createNode(page, 'original-start', 0);
    const originalEnd = createNode(page, 'original-end', 160);
    const copyStart = createNode(page, 'copy-start', 320);
    const copyEnd = createNode(page, 'copy-end', 520);
    const connectorGroups = [];
    const runtime = createRuntime(page, connectorGroups);

    page.children = [originalStart, originalEnd, copyStart, copyEnd];
    globalThis.figma = createFigmaStub(page, connectorGroups);

    connect.resetObservedEndpointSelection(runtime);

    page.selection = [originalStart];
    connect.handleSelectionChange(runtime);
    page.selection = [originalStart, originalEnd];
    connect.handleSelectionChange(runtime);
    page.selection = [copyStart, copyEnd];
    connect.handleSelectionChange(runtime);

    connect.createFlowConnector('', runtime);

    assert.equal(connectorGroups.length, 1);
    assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ['copy-start', 'copy-end']);
    assert.deepEqual(readConnectorRefs(copyStart), ['connector-1']);
    assert.deepEqual(readConnectorRefs(copyEnd), ['connector-1']);
    assert.deepEqual(readConnectorRefs(originalStart), []);
    assert.deepEqual(readConnectorRefs(originalEnd), []);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('keeps simultaneous two-endpoint selection ignored without a prior endpoint window', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const first = createNode(page, 'first', 0);
    const second = createNode(page, 'second', 160);
    const runtime = createRuntime(page);

    page.children = [first, second];
    globalThis.figma = { currentPage: page };

    connect.resetObservedEndpointSelection(runtime);

    page.selection = [first, second];
    connect.handleSelectionChange(runtime);
    assert.deepEqual(getPendingEndpointIds(connect, runtime), []);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('ignores pre-open selected endpoints and keeps a runtime rolling two-endpoint window', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const first = createNode(page, 'first', 0);
    const second = createNode(page, 'second', 160);
    const third = createNode(page, 'third', 320);
    const runtime = createRuntime(page);

    page.children = [first, second, third];
    globalThis.figma = { currentPage: page };

    page.selection = [first];
    connect.resetObservedEndpointSelection(runtime);
    assert.deepEqual(getPendingEndpointIds(connect, runtime), []);

    page.selection = [first, second];
    connect.handleSelectionChange(runtime);
    assert.deepEqual(getPendingEndpointIds(connect, runtime), ['second']);

    page.selection = [first, second, third];
    connect.handleSelectionChange(runtime);
    assert.deepEqual(getPendingEndpointIds(connect, runtime), ['second', 'third']);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('excludes Annotation Cards and Annotation Badges from pending Flow Endpoints', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const subject = createNode(page, 'subject', 0);
    const annotationCard = createNode(page, 'annotation-card', 160);
    const annotationBadge = createNode(page, 'annotation-badge', 320);
    const runtime = createRuntime(page);

    annotationCard.setSharedPluginData('figma_flow_annotator', 'kind', 'annotation-card');
    annotationBadge.setSharedPluginData('figma_flow_annotator', 'kind', 'annotation-badge');
    page.children = [subject, annotationCard, annotationBadge];
    globalThis.figma = { currentPage: page };

    connect.resetObservedEndpointSelection(runtime);

    page.selection = [subject];
    connect.handleSelectionChange(runtime);
    page.selection = [subject, annotationCard];
    connect.handleSelectionChange(runtime);
    page.selection = [subject, annotationCard, annotationBadge];
    connect.handleSelectionChange(runtime);

    assert.deepEqual(getPendingEndpointIds(connect, runtime), ['subject']);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('swaps pending Flow Endpoint direction in runtime state', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const start = createNode(page, 'start', 0);
    const end = createNode(page, 'end', 160);
    const runtime = createRuntime(page);

    page.children = [start, end];
    globalThis.figma = { currentPage: page };

    connect.resetObservedEndpointSelection(runtime);
    page.selection = [start];
    connect.handleSelectionChange(runtime);
    page.selection = [start, end];
    connect.handleSelectionChange(runtime);

    connect.swapPendingConnectorEndpoints(runtime);

    assert.deepEqual(getPendingEndpointIds(connect, runtime), ['end', 'start']);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('posts selection state after endpoint selection without walking the page', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const endpoint = createNode(page, 'endpoint', 0);
    const largeFrame = createNode(page, 'large-frame', 160);
    const runtime = createRuntime(page);
    let pageWalks = 0;
    let postedEndpointIds = [];

    page.children = [endpoint, largeFrame];
    globalThis.figma = { currentPage: page };
    runtime.walkPageNodes = () => {
      pageWalks += 1;
      throw new Error('Connector selection must not walk the page.');
    };
    runtime.postSelectionState = () => {
      postedEndpointIds = getPendingEndpointIds(connect, runtime);
    };

    connect.resetObservedEndpointSelection(runtime);

    page.selection = [endpoint];
    connect.handleSelectionChange(runtime);

    assert.equal(pageWalks, 0);
    assert.deepEqual(postedEndpointIds, ['endpoint']);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('prunes removed pending endpoints before endpoint eligibility checks', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const removedEndpoint = createNode(page, 'removed-endpoint', 0);
    const liveEndpoint = createNode(page, 'live-endpoint', 160);
    const runtime = createRuntime(page);
    const checkedEndpointIds = [];
    let assertRemovedNodeSkipped = false;

    page.children = [removedEndpoint, liveEndpoint];
    globalThis.figma = { currentPage: page };
    runtime.hasGeneratedAncestor = (node) => {
      checkedEndpointIds.push(node.id);
      if (assertRemovedNodeSkipped) {
        assert.notEqual(node.id, 'removed-endpoint');
      }
      return false;
    };

    connect.resetObservedEndpointSelection(runtime);

    page.selection = [removedEndpoint];
    connect.handleSelectionChange(runtime);
    page.selection = [removedEndpoint, liveEndpoint];
    connect.handleSelectionChange(runtime);
    assert.deepEqual(getPendingEndpointIds(connect, runtime), ['removed-endpoint', 'live-endpoint']);

    removedEndpoint.removed = true;
    assertRemovedNodeSkipped = true;

    assert.deepEqual(getPendingEndpointIds(connect, runtime), ['live-endpoint']);
    assert.ok(checkedEndpointIds.includes('live-endpoint'));
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('creates a Flow Connector without scanning children of unrelated frame obstacles', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const start = createNode(page, 'start', 0);
    const end = createNode(page, 'end', 400);
    const unrelatedFrame = createNode(page, 'unrelated-frame', 1000);
    const nestedChild = createNode(page, 'nested-child', 1040);
    const connectorGroups = [];
    const runtime = createRuntime(page, connectorGroups);

    nestedChild.parent = unrelatedFrame;
    nestedChild.getSharedPluginData = () => {
      throw new Error('Unrelated frame obstacle descendants must not be scanned.');
    };
    unrelatedFrame.children = [nestedChild];
    page.children = [start, end, unrelatedFrame];
    globalThis.figma = createFigmaStub(page, connectorGroups);

    connect.resetObservedEndpointSelection(runtime);

    page.selection = [start];
    connect.handleSelectionChange(runtime);
    page.selection = [start, end];
    connect.handleSelectionChange(runtime);

    connect.createFlowConnector('', runtime);

    assert.equal(connectorGroups.length, 1);
    assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ['start', 'end']);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('collects Context Frames and Annotation Cards as obstacles while excluding Annotation Badges', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const start = createNode(page, 'start', 0);
    const end = createNode(page, 'end', 520);
    const middleFrame = createNode(page, 'middle-frame', 220);
    const annotationCard = createNode(page, 'annotation-card', 360);
    const annotationBadge = createNode(page, 'annotation-badge', 460);
    const runtime = createRuntime(page);

    annotationCard.setSharedPluginData('figma_flow_annotator', 'kind', 'annotation-card');
    annotationBadge.setSharedPluginData('figma_flow_annotator', 'kind', 'annotation-badge');
    page.children = [start, middleFrame, annotationCard, annotationBadge, end];
    globalThis.figma = { currentPage: page };

    const obstacles = connect.collectConnectorObstacles(start, end, runtime);

    assert.deepEqual(
      obstacles.map((obstacle) => [obstacle.id, obstacle.kind]),
      [
        ['middle-frame', 'context-frame'],
        ['annotation-card', 'annotation-card'],
      ],
    );
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('routes around a middle Context Frame and writes only the successful route cache', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const start = createNode(page, 'start', 0);
    const middleFrame = createNode(page, 'middle-frame', 180);
    const end = createNode(page, 'end', 380);
    const connectorGroups = [];
    const runtime = createRuntime(page, connectorGroups);

    page.children = [start, middleFrame, end];
    globalThis.figma = createFigmaStub(page, connectorGroups);

    connect.resetObservedEndpointSelection(runtime);
    page.selection = [start];
    connect.handleSelectionChange(runtime);
    page.selection = [start, end];
    connect.handleSelectionChange(runtime);

    connect.createFlowConnector('', runtime);

    const routePoints = readConnector(connectorGroups[0]).routeCache.points;
    assert.equal(routeIsOrthogonal(routePoints), true);
    assert.equal(routeIntersectsRect(routePoints, expandRect(middleFrame.absoluteBoundingBox, 24)), false);
    assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ['start', 'end']);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('fails connector creation atomically when no legal route exists', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const start = createNode(page, 'start', 0);
    const walls = [
      createNode(page, 'left-wall', -60),
      createNode(page, 'right-wall', 80),
      createNode(page, 'top-wall', -60),
      createNode(page, 'bottom-wall', -60),
    ];
    const end = createNode(page, 'end', 320);
    const connectorGroups = [];
    const runtime = createRuntime(page, connectorGroups);

    [
      { x: -60, y: -60, width: 50, height: 200 },
      { x: 80, y: -60, width: 50, height: 200 },
      { x: -60, y: -60, width: 190, height: 50 },
      { x: -60, y: 80, width: 190, height: 50 },
    ].forEach((rect, index) => {
      walls[index].absoluteBoundingBox = rect;
      walls[index].x = rect.x;
      walls[index].y = rect.y;
      walls[index].width = rect.width;
      walls[index].height = rect.height;
    });
    page.children = [start, ...walls, end];
    globalThis.figma = createFigmaStub(page, connectorGroups);

    connect.resetObservedEndpointSelection(runtime);
    page.selection = [start];
    connect.handleSelectionChange(runtime);
    page.selection = [start, end];
    connect.handleSelectionChange(runtime);

    assert.throws(
      () => connect.createFlowConnector('', runtime),
      /No legal Orthogonal Route avoids Connector Obstacles/,
    );
    assert.equal(connectorGroups.length, 0);
    assert.equal(page.children.some((node) => node.name === 'FFA Connectors'), false);
    assert.deepEqual(readConnectorRefs(start), []);
    assert.deepEqual(readConnectorRefs(end), []);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('upserts an existing directed Flow Connector and keeps reverse direction separate', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const start = createNode(page, 'start', 0);
    const end = createNode(page, 'end', 400);
    const connectorGroups = [];
    const runtime = createRuntime(page, connectorGroups);

    page.children = [start, end];
    globalThis.figma = createFigmaStub(page, connectorGroups);

    connect.resetObservedEndpointSelection(runtime);
    page.selection = [start];
    connect.handleSelectionChange(runtime);
    page.selection = [start, end];
    connect.handleSelectionChange(runtime);

    connect.createFlowConnector('click', runtime);
    assert.equal(connectorGroups.length, 1);
    assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ['start', 'end']);
    assert.equal(readConnector(connectorGroups[0]).flowAction, 'click');
    const unchangedConnectorData = connectorGroups[0].getSharedPluginData('figma_flow_annotator', 'connector');

    connect.createFlowConnector(' click ', runtime);
    assert.equal(connectorGroups.length, 1);
    assert.equal(connectorGroups[0].getSharedPluginData('figma_flow_annotator', 'connector'), unchangedConnectorData);

    connect.createFlowConnector('', runtime);
    assert.equal(connectorGroups.length, 1);
    assert.equal(readConnector(connectorGroups[0]).flowAction, null);

    connect.swapPendingConnectorEndpoints(runtime);
    connect.createFlowConnector('', runtime);
    assert.equal(connectorGroups.length, 2);
    assert.deepEqual(readConnectorEndpointIds(connectorGroups[1]), ['end', 'start']);
    assert.deepEqual(readConnectorRefs(start), ['connector-1', 'connector-2']);
    assert.deepEqual(readConnectorRefs(end), ['connector-1', 'connector-2']);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('reports Connect preview and existing directed connector status from project connector container only', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const start = createNode(page, 'start', 0);
    const end = createNode(page, 'end', 400);
    const connectorGroups = [];
    const runtime = createRuntime(page, connectorGroups);

    page.children = [start, end];
    globalThis.figma = createFigmaStub(page, connectorGroups);

    connect.resetObservedEndpointSelection(runtime);
    page.selection = [start];
    connect.handleSelectionChange(runtime);
    page.selection = [start, end];
    connect.handleSelectionChange(runtime);
    connect.createFlowConnector('choose', runtime);

    const state = connect.getConnectSelectionState(runtime);

    assert.deepEqual(state.endpoints.map((endpoint) => endpoint.name), ['start', 'end']);
    assert.equal(state.existingConnector.id, 'connector-1');
    assert.equal(state.existingConnector.flowAction, 'choose');
    assert.equal(state.routingStatus, 'Route preview pending router validation.');
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('regenerates trunked connector labels on branch segments after shared-end create', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const startA = createNode(page, 'start-a', 0);
    const startB = createNode(page, 'start-b', 0);
    const end = createNode(page, 'end', 520);
    const connectorGroups = [];
    const runtime = createRuntime(page, connectorGroups);

    moveNode(startA, { x: 0, y: 0, width: 100, height: 100 });
    moveNode(startB, { x: 0, y: 220, width: 100, height: 100 });
    moveNode(end, { x: 520, y: 110, width: 100, height: 100 });
    page.children = [startA, startB, end];
    globalThis.figma = createFigmaStub(page, connectorGroups);

    connect.resetObservedEndpointSelection(runtime);
    page.selection = [startA];
    connect.handleSelectionChange(runtime);
    page.selection = [startA, end];
    connect.handleSelectionChange(runtime);
    connect.createFlowConnector('from A', runtime);

    page.selection = [];
    connect.resetObservedEndpointSelection(runtime);
    page.selection = [startB];
    connect.handleSelectionChange(runtime);
    page.selection = [startB, end];
    connect.handleSelectionChange(runtime);
    connect.createFlowConnector('from B', runtime);

    assert.equal(connectorGroups.length, 2);
    const firstRoute = readConnector(connectorGroups[0]).routeCache.points;
    const secondRoute = readConnector(connectorGroups[1]).routeCache.points;
    const sharedFinalSegment = finalSegment(firstRoute);
    assert.deepEqual(finalSegment(secondRoute), sharedFinalSegment);

    const firstLabelCenter = getLabelCenter(connectorGroups[0]);
    const secondLabelCenter = getLabelCenter(connectorGroups[1]);
    assert.equal(pointOnSegment(firstLabelCenter, sharedFinalSegment), false);
    assert.equal(pointOnSegment(secondLabelCenter, sharedFinalSegment), false);
    assert.notDeepEqual(firstLabelCenter, secondLabelCenter);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('refreshes current-page Flow Connectors and gives selected connector roots precedence', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const start = createNode(page, 'start', 0);
    const end = createNode(page, 'end', 400);
    const alternateEnd = createNode(page, 'alternate-end', 400);
    const connectorGroups = [];
    const runtime = createRuntime(page, connectorGroups);

    alternateEnd.absoluteBoundingBox = { x: 400, y: 180, width: 100, height: 100 };
    alternateEnd.y = 180;
    page.children = [start, end, alternateEnd];
    globalThis.figma = createFigmaStub(page, connectorGroups);

    connect.resetObservedEndpointSelection(runtime);
    page.selection = [start];
    connect.handleSelectionChange(runtime);
    page.selection = [start, end];
    connect.handleSelectionChange(runtime);
    connect.createFlowConnector('click', runtime);

    page.selection = [];
    connect.resetObservedEndpointSelection(runtime);
    page.selection = [start];
    connect.handleSelectionChange(runtime);
    page.selection = [start, alternateEnd];
    connect.handleSelectionChange(runtime);
    connect.createFlowConnector('choose', runtime);

    const firstInitialRoute = readConnector(connectorGroups[0]).routeCache.points;
    const secondInitialRoute = readConnector(connectorGroups[1]).routeCache.points;

    moveNode(end, { x: 560, y: 0, width: 100, height: 100 });
    moveNode(alternateEnd, { x: 560, y: 220, width: 100, height: 100 });
    page.selection = [];
    const pageRefresh = await connect.refreshFlowConnectors(runtime);

    assert.equal(pageRefresh.selectedOnly, false);
    assert.equal(pageRefresh.refreshedCount, 2);
    assert.equal(pageRefresh.failedCount, 0);
    assert.notDeepEqual(readConnector(connectorGroups[0]).routeCache.points, firstInitialRoute);
    assert.notDeepEqual(readConnector(connectorGroups[1]).routeCache.points, secondInitialRoute);

    const firstPageRoute = readConnector(connectorGroups[0]).routeCache.points;
    const secondPageRoute = readConnector(connectorGroups[1]).routeCache.points;

    moveNode(end, { x: 700, y: 0, width: 100, height: 100 });
    moveNode(alternateEnd, { x: 700, y: 260, width: 100, height: 100 });
    page.selection = [connectorGroups[0]];
    const selectedRefresh = await connect.refreshFlowConnectors(runtime);

    assert.equal(selectedRefresh.selectedOnly, true);
    assert.equal(selectedRefresh.refreshedCount, 1);
    assert.equal(selectedRefresh.failedCount, 0);
    assert.deepEqual(selectedRefresh.nodes.map((node) => node.id), [connectorGroups[0].id]);
    assert.notDeepEqual(readConnector(connectorGroups[0]).routeCache.points, firstPageRoute);
    assert.deepEqual(readConnector(connectorGroups[1]).routeCache.points, secondPageRoute);
    assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ['start', 'end']);
    assert.equal(readConnector(connectorGroups[0]).flowAction, 'click');
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

test('preserves an existing Flow Connector route and record when refresh routing fails', async () => {
  try {
    const connect = await importConnectModule();
    const page = { type: 'PAGE', id: 'page', children: [], selection: [] };
    const start = createNode(page, 'start', 0);
    const end = createNode(page, 'end', 320);
    const connectorGroups = [];
    const runtime = createRuntime(page, connectorGroups);

    page.children = [start, end];
    globalThis.figma = createFigmaStub(page, connectorGroups);

    connect.resetObservedEndpointSelection(runtime);
    page.selection = [start];
    connect.handleSelectionChange(runtime);
    page.selection = [start, end];
    connect.handleSelectionChange(runtime);
    connect.createFlowConnector('click', runtime);

    const originalConnectorData = connectorGroups[0].getSharedPluginData('figma_flow_annotator', 'connector');
    const originalChildIds = connectorGroups[0].children.map((child) => child.id);
    const walls = [
      createNode(page, 'left-wall', -60),
      createNode(page, 'right-wall', 80),
      createNode(page, 'top-wall', -60),
      createNode(page, 'bottom-wall', -60),
    ];

    [
      { x: -60, y: -60, width: 50, height: 200 },
      { x: 80, y: -60, width: 50, height: 200 },
      { x: -60, y: -60, width: 190, height: 50 },
      { x: -60, y: 80, width: 190, height: 50 },
    ].forEach((rect, index) => {
      moveNode(walls[index], rect);
    });
    page.children = [start, ...walls, end, page.children.find((node) => node.name === 'FFA Connectors')];
    page.selection = [connectorGroups[0]];

    const result = await connect.refreshFlowConnectors(runtime);

    assert.equal(result.selectedOnly, true);
    assert.equal(result.refreshedCount, 0);
    assert.equal(result.failedCount, 1);
    assert.match(result.failures[0], /No legal Orthogonal Route avoids Connector Obstacles/);
    assert.equal(connectorGroups[0].getSharedPluginData('figma_flow_annotator', 'connector'), originalConnectorData);
    assert.deepEqual(connectorGroups[0].children.map((child) => child.id), originalChildIds);
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

async function importConnectModule() {
  await mkdir(buildDir, { recursive: true });
  const outfile = resolve(buildDir, `connect-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await build({
    bundle: true,
    entryPoints: [resolve(appRoot, 'connect.ts')],
    format: 'esm',
    outfile,
    platform: 'node',
    target: 'es2019',
  });
  return import(pathToFileURL(outfile).href);
}

function createNode(page, id, x) {
  const sharedPluginData = new Map();
  const node = {
    absoluteBoundingBox: { x, y: 0, width: 100, height: 100 },
    appendChild: (child) => {
      child.parent = node;
      node.children.push(child);
    },
    children: [],
    getSharedPluginData: (_namespace, key) => sharedPluginData.get(key) ?? '',
    height: 100,
    id,
    name: id,
    parent: page,
    removed: false,
    remove: () => {
      node.removed = true;
      if (node.parent && Array.isArray(node.parent.children)) {
        node.parent.children = node.parent.children.filter((child) => child !== node);
      }
    },
    resize: (width, height) => {
      node.width = width;
      node.height = height;
      node.absoluteBoundingBox = { ...node.absoluteBoundingBox, width, height };
    },
    setSharedPluginData: (_namespace, key, value) => {
      sharedPluginData.set(key, value);
    },
    type: 'FRAME',
    width: 100,
    x,
    y: 0,
  };
  return node;
}

function createRuntime(page, connectorGroups = []) {
  let connectorId = 0;
  return {
    appendConnectorReference: (node, connectorId) => {
      const refs = readConnectorRefs(node);
      node.setSharedPluginData('figma_flow_annotator', 'connectorRefs', JSON.stringify({
        schemaVersion: 1,
        connectorIds: refs.includes(connectorId) ? refs : [...refs, connectorId],
      }));
    },
    createId: () => `connector-${connectorId += 1}`,
    createText: (name, characters, fontSize, fills, width) => ({
      characters,
      fills: [fills],
      fontSize,
      height: 16,
      name,
      resize: (nextWidth, _nextHeight) => {
        width = nextWidth;
      },
      textAutoResize: 'NONE',
      type: 'TEXT',
      width: Math.min(width, Math.max(16, characters.length * 7)),
      x: 0,
      y: 0,
    }),
    ensureContainer: () => {
      const existing = page.children.find((node) => node.name === 'FFA Connectors');
      if (existing) {
        return existing;
      }
      const container = createNode(page, 'connector-container', 0);
      container.name = 'FFA Connectors';
      container.children = connectorGroups;
      container.setSharedPluginData('figma_flow_annotator', 'kind', 'container');
      page.children.push(container);
      return container;
    },
    ensureLayerOrder: () => {},
    findContextFrameId: (node) => node.id,
    getVisibleBounds: (node) => node.absoluteBoundingBox,
    hasGeneratedAncestor: (node) => node.getSharedPluginData('figma_flow_annotator', 'kind') !== '',
    namespace: 'figma_flow_annotator',
    postSelectionState: () => {},
    readableName: (name) => name,
    solidPaint: (r, g, b) => ({ type: 'SOLID', color: { r, g, b } }),
  };
}

function createFigmaStub(page, connectorGroups) {
  return {
    createFrame: () => {
      const frame = createNode(page, `frame-${Math.random().toString(36).slice(2)}`, 0);
      frame.appendChild = (child) => {
        child.parent = frame;
        frame.children.push(child);
      };
      frame.resize = (width, height) => {
        frame.width = width;
        frame.height = height;
      };
      return frame;
    },
    createNodeFromSvg: () => createNode(page, `svg-${Math.random().toString(36).slice(2)}`, 0),
    currentPage: page,
    getNodeByIdAsync: async (nodeId) => findNodeById(page, nodeId),
    group: (nodes, parent) => {
      const group = createNode(page, `connector-node-${connectorGroups.length + 1}`, 0);
      group.children = nodes;
      nodes.forEach((node) => {
        node.parent = group;
      });
      group.parent = parent;
      group.type = 'GROUP';
      group.appendChild = (child) => {
        child.parent = group;
        group.children.push(child);
      };
      connectorGroups.push(group);
      return group;
    },
  };
}

function findNodeById(root, nodeId) {
  if (root.id === nodeId) {
    return root;
  }
  if (!Array.isArray(root.children)) {
    return null;
  }
  for (const child of root.children) {
    const match = findNodeById(child, nodeId);
    if (match !== null) {
      return match;
    }
  }
  return null;
}

function moveNode(node, rect) {
  node.absoluteBoundingBox = rect;
  node.x = rect.x;
  node.y = rect.y;
  node.width = rect.width;
  node.height = rect.height;
}

function getPendingEndpointIds(connect, runtime) {
  return connect.getPendingConnectorEndpointNodes(runtime).map((node) => node.id);
}

function readConnectorEndpointIds(connectorGroup) {
  const connector = readConnector(connectorGroup);
  return [connector.start.nodeId, connector.end.nodeId];
}

function readConnector(connectorGroup) {
  return JSON.parse(connectorGroup.getSharedPluginData('figma_flow_annotator', 'connector'));
}

function readConnectorRefs(node) {
  const data = node.getSharedPluginData('figma_flow_annotator', 'connectorRefs');
  return data.length === 0 ? [] : JSON.parse(data).connectorIds;
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

function finalSegment(points) {
  return {
    start: points[points.length - 2],
    end: points[points.length - 1],
  };
}

function getLabelCenter(connectorGroup) {
  const label = connectorGroup.children.find((child) => child.name === 'FFA Flow Action Label');
  assert.ok(label, 'expected Flow Action label visual node');
  return {
    x: label.x + label.width / 2,
    y: label.y + label.height / 2,
  };
}

function pointOnSegment(point, segment) {
  if (segment.start.y === segment.end.y) {
    return (
      point.y === segment.start.y &&
      point.x >= Math.min(segment.start.x, segment.end.x) &&
      point.x <= Math.max(segment.start.x, segment.end.x)
    );
  }
  if (segment.start.x === segment.end.x) {
    return (
      point.x === segment.start.x &&
      point.y >= Math.min(segment.start.y, segment.end.y) &&
      point.y <= Math.max(segment.start.y, segment.end.y)
    );
  }
  return false;
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
