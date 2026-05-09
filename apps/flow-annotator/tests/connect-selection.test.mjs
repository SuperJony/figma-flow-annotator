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
  return {
    absoluteBoundingBox: { x, y: 0, width: 100, height: 100 },
    children: [],
    getSharedPluginData: (_namespace, key) => sharedPluginData.get(key) ?? '',
    id,
    name: id,
    parent: page,
    removed: false,
    setSharedPluginData: (_namespace, key, value) => {
      sharedPluginData.set(key, value);
    },
    type: 'FRAME',
  };
}

function createRuntime(page, connectorGroups = []) {
  return {
    appendConnectorReference: (node, connectorId) => {
      const refs = readConnectorRefs(node);
      node.setSharedPluginData('figma_flow_annotator', 'connectorRefs', JSON.stringify({
        schemaVersion: 1,
        connectorIds: refs.includes(connectorId) ? refs : [...refs, connectorId],
      }));
    },
    createId: () => 'connector-1',
    createText: () => {
      throw new Error('Flow Action labels are not used in this test.');
    },
    ensureContainer: () => {
      const container = createNode(page, 'FFA Connectors', 0);
      container.children = connectorGroups;
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
    createNodeFromSvg: () => ({
      clipsContent: true,
      name: '',
      type: 'FRAME',
      x: 0,
      y: 0,
    }),
    currentPage: page,
    group: (nodes, parent) => {
      const group = createNode(page, '', 0);
      group.children = nodes;
      group.parent = parent;
      group.type = 'GROUP';
      connectorGroups.push(group);
      return group;
    },
  };
}

function getPendingEndpointIds(connect, runtime) {
  return connect.getPendingConnectorEndpointNodes(runtime).map((node) => node.id);
}

function readConnectorEndpointIds(connectorGroup) {
  const connector = JSON.parse(connectorGroup.getSharedPluginData('figma_flow_annotator', 'connector'));
  return [connector.start.nodeId, connector.end.nodeId];
}

function readConnectorRefs(node) {
  const data = node.getSharedPluginData('figma_flow_annotator', 'connectorRefs');
  return data.length === 0 ? [] : JSON.parse(data).connectorIds;
}
