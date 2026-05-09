import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = resolve(appRoot, '.test-build-annotation');
const namespace = 'figma_flow_annotator';

test('creates an Annotation without scanning unrelated frame descendants for numbering', async () => {
  try {
    const page = createPage();
    const subjectA = createNode(page, 'subject-a', 0);
    const subjectB = createNode(page, 'subject-b', 180);
    const unrelatedFrame = createNode(page, 'unrelated-frame', 480);
    const nestedChild = createNode(unrelatedFrame, 'nested-child', 520);
    const annotationsContainer = createNode(page, 'FFA Annotations', 800);
    const existingCard = createNode(annotationsContainer, 'FFA Annotation Card #4', 820);
    const messages = [];

    annotationsContainer.setSharedPluginData(namespace, 'kind', 'container');
    existingCard.setSharedPluginData(namespace, 'kind', 'annotation-card');
    existingCard.setSharedPluginData(namespace, 'annotation', JSON.stringify({
      schemaVersion: 1,
      id: 'annotation-existing',
      annotationNumber: 4,
      body: 'existing',
      contextFrameId: page.id,
      subjectNodeIds: ['old-subject'],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    }));

    nestedChild.getSharedPluginData = () => {
      throw new Error('Annotation numbering must not scan unrelated frame descendants.');
    };
    unrelatedFrame.children = [nestedChild];
    annotationsContainer.children = [existingCard];
    page.children = [subjectA, subjectB, unrelatedFrame, annotationsContainer];
    page.selection = [subjectA, subjectB];
    globalThis.figma = createFigmaStub(page, messages);

    await importCodeModule();

    globalThis.figma.ui.onmessage({ type: 'create-annotation', body: 'New note' });
    await flushPluginMessage(messages);

    const createdCard = annotationsContainer.children.find(
      (child) => child.getSharedPluginData(namespace, 'kind') === 'annotation-card' && child !== existingCard,
    );
    const createdRecord = JSON.parse(createdCard.getSharedPluginData(namespace, 'annotation'));
    const createdBadges = annotationsContainer.children.filter(
      (child) => child.getSharedPluginData(namespace, 'kind') === 'annotation-badge',
    );
    const contextRecord = JSON.parse(page.getSharedPluginData(namespace, 'context'));
    const status = messages.find((message) => message.type === 'status' && message.tone === 'success');

    assert.ok(createdCard);
    assert.equal(createdCard.name, 'FFA Annotation Card #5');
    assert.equal(createdRecord.schemaVersion, 1);
    assert.equal(createdRecord.annotationNumber, 5);
    assert.deepEqual(createdRecord.subjectNodeIds, ['subject-a', 'subject-b']);
    assert.equal(createdBadges.length, 2);
    assert.deepEqual(readAnnotationRefs(subjectA), [createdRecord.id]);
    assert.deepEqual(readAnnotationRefs(subjectB), [createdRecord.id]);
    assert.equal(contextRecord.nextAnnotationNumber, 6);
    assert.equal(status.message, 'Created annotation #5 with 2 badge(s).');
  } finally {
    await rm(buildDir, { force: true, recursive: true });
  }
});

async function flushPluginMessage(messages) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (messages.some((message) => message.type === 'status')) {
      return;
    }
    await Promise.resolve();
  }
}

async function importCodeModule() {
  await mkdir(buildDir, { recursive: true });
  const outfile = resolve(buildDir, `code-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await build({
    bundle: true,
    define: {
      __html__: '""',
    },
    entryPoints: [resolve(appRoot, 'code.ts')],
    format: 'esm',
    outfile,
    platform: 'node',
    target: 'es2019',
  });
  return import(pathToFileURL(outfile).href);
}

function createPage() {
  const page = createNode(null, 'page', 0);
  page.type = 'PAGE';
  page.selection = [];
  page.appendChild = (node) => {
    appendChild(page, node);
  };
  return page;
}

function createNode(parent, id, x) {
  const sharedPluginData = new Map();
  const node = {
    absoluteBoundingBox: { x, y: 0, width: 100, height: 100 },
    appendChild: (child) => {
      appendChild(node, child);
    },
    children: [],
    clipsContent: false,
    cornerRadius: 0,
    fills: [],
    getSharedPluginData: (_namespace, key) => sharedPluginData.get(key) ?? '',
    height: 100,
    id,
    name: id,
    parent,
    removed: false,
    resize: (width, height) => {
      node.width = width;
      node.height = height;
      node.absoluteBoundingBox.width = width;
      node.absoluteBoundingBox.height = height;
    },
    setSharedPluginData: (_namespace, key, value) => {
      sharedPluginData.set(key, value);
    },
    strokes: [],
    strokeWeight: 0,
    type: 'FRAME',
    width: 100,
    x,
    y: 0,
  };
  return node;
}

function createTextNode() {
  const text = createNode(null, 'text', 0);
  text.type = 'TEXT';
  text.height = 16;
  text.width = 80;
  text.resize = (width, height) => {
    text.width = width;
    text.height = Math.max(16, height);
  };
  return text;
}

function appendChild(parent, child) {
  const existingParent = child.parent;
  if (existingParent && 'children' in existingParent) {
    existingParent.children = existingParent.children.filter((node) => node !== child);
  }
  child.parent = parent;
  parent.children.push(child);
}

function readAnnotationRefs(node) {
  const data = node.getSharedPluginData(namespace, 'annotationRefs');
  return data.length === 0 ? [] : JSON.parse(data).annotationIds;
}

function createFigmaStub(page, messages) {
  return {
    closePlugin: () => {},
    createFrame: () => createNode(null, '', 0),
    createText: createTextNode,
    currentPage: page,
    loadFontAsync: async () => {},
    notify: () => {},
    on: () => {},
    showUI: () => {},
    ui: {
      onmessage: null,
      postMessage: (message) => {
        messages.push(message);
      },
    },
    viewport: {
      scrollAndZoomIntoView: () => {},
    },
  };
}
