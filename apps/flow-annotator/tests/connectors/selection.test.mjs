import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createFigmaStub,
  createNode,
  createRuntime,
  getPendingEndpointIds,
  importConnectModule,
  readConnectorEndpointIds,
  readConnectorRefs,
} from "./test-helpers.mjs";

test("replaces a stale Flow Endpoint window after Figma duplicate selection", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const originalStart = createNode(page, "original-start", 0);
  const originalEnd = createNode(page, "original-end", 160);
  const copyStart = createNode(page, "copy-start", 320);
  const copyEnd = createNode(page, "copy-end", 480);
  const runtime = createRuntime(page);

  page.children = [originalStart, originalEnd, copyStart, copyEnd];
  globalThis.figma = { currentPage: page };

  connect.resetObservedEndpointSelection(runtime);

  page.selection = [originalStart];
  connect.handleSelectionChange(runtime);
  page.selection = [originalStart, originalEnd];
  connect.handleSelectionChange(runtime);
  assert.deepEqual(getPendingEndpointIds(connect, runtime), ["original-start", "original-end"]);

  page.selection = [copyStart, copyEnd];
  connect.handleSelectionChange(runtime);
  assert.deepEqual(getPendingEndpointIds(connect, runtime), ["copy-start", "copy-end"]);
});

test("creates a Flow Connector on duplicated selected endpoints, not the originals", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const originalStart = createNode(page, "original-start", 0);
  const originalEnd = createNode(page, "original-end", 160);
  const copyStart = createNode(page, "copy-start", 320);
  const copyEnd = createNode(page, "copy-end", 520);
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

  connect.createFlowConnector("", runtime);

  assert.equal(connectorGroups.length, 1);
  assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ["copy-start", "copy-end"]);
  assert.deepEqual(readConnectorRefs(copyStart), ["connector-1"]);
  assert.deepEqual(readConnectorRefs(copyEnd), ["connector-1"]);
  assert.deepEqual(readConnectorRefs(originalStart), []);
  assert.deepEqual(readConnectorRefs(originalEnd), []);
});

test("keeps simultaneous two-endpoint selection ignored without a prior endpoint window", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const first = createNode(page, "first", 0);
  const second = createNode(page, "second", 160);
  const runtime = createRuntime(page);

  page.children = [first, second];
  globalThis.figma = { currentPage: page };

  connect.resetObservedEndpointSelection(runtime);

  page.selection = [first, second];
  connect.handleSelectionChange(runtime);
  assert.deepEqual(getPendingEndpointIds(connect, runtime), []);
});

test("ignores pre-open selected endpoints and keeps a runtime rolling two-endpoint window", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const first = createNode(page, "first", 0);
  const second = createNode(page, "second", 160);
  const third = createNode(page, "third", 320);
  const runtime = createRuntime(page);

  page.children = [first, second, third];
  globalThis.figma = { currentPage: page };

  page.selection = [first];
  connect.resetObservedEndpointSelection(runtime);
  assert.deepEqual(getPendingEndpointIds(connect, runtime), []);

  page.selection = [first, second];
  connect.handleSelectionChange(runtime);
  assert.deepEqual(getPendingEndpointIds(connect, runtime), ["second"]);

  page.selection = [first, second, third];
  connect.handleSelectionChange(runtime);
  assert.deepEqual(getPendingEndpointIds(connect, runtime), ["second", "third"]);
});

test("excludes Annotation Cards and Annotation Badges from pending Flow Endpoints", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const subject = createNode(page, "subject", 0);
  const annotationCard = createNode(page, "annotation-card", 160);
  const annotationBadge = createNode(page, "annotation-badge", 320);
  const runtime = createRuntime(page);

  annotationCard.setSharedPluginData("figma_flow_annotator", "kind", "annotation-card");
  annotationBadge.setSharedPluginData("figma_flow_annotator", "kind", "annotation-badge");
  page.children = [subject, annotationCard, annotationBadge];
  globalThis.figma = { currentPage: page };

  connect.resetObservedEndpointSelection(runtime);

  page.selection = [subject];
  connect.handleSelectionChange(runtime);
  page.selection = [subject, annotationCard];
  connect.handleSelectionChange(runtime);
  page.selection = [subject, annotationCard, annotationBadge];
  connect.handleSelectionChange(runtime);

  assert.deepEqual(getPendingEndpointIds(connect, runtime), ["subject"]);
});

test("swaps pending Flow Endpoint direction in runtime state", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const end = createNode(page, "end", 160);
  const runtime = createRuntime(page);

  page.children = [start, end];
  globalThis.figma = { currentPage: page };

  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);

  connect.swapPendingConnectorEndpoints(runtime);

  assert.deepEqual(getPendingEndpointIds(connect, runtime), ["end", "start"]);
});

test("posts selection state after endpoint selection without walking the page", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const endpoint = createNode(page, "endpoint", 0);
  const largeFrame = createNode(page, "large-frame", 160);
  const runtime = createRuntime(page);
  let pageWalks = 0;
  let postedEndpointIds = [];

  page.children = [endpoint, largeFrame];
  globalThis.figma = { currentPage: page };
  runtime.walkPageNodes = () => {
    pageWalks += 1;
    throw new Error("Connector selection must not walk the page.");
  };
  runtime.postSelectionState = () => {
    postedEndpointIds = getPendingEndpointIds(connect, runtime);
  };

  connect.resetObservedEndpointSelection(runtime);

  page.selection = [endpoint];
  connect.handleSelectionChange(runtime);

  assert.equal(pageWalks, 0);
  assert.deepEqual(postedEndpointIds, ["endpoint"]);
});

test("prunes removed pending endpoints before endpoint eligibility checks", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const removedEndpoint = createNode(page, "removed-endpoint", 0);
  const liveEndpoint = createNode(page, "live-endpoint", 160);
  const runtime = createRuntime(page);
  const checkedEndpointIds = [];
  let assertRemovedNodeSkipped = false;

  page.children = [removedEndpoint, liveEndpoint];
  globalThis.figma = { currentPage: page };
  runtime.hasGeneratedAncestor = (node) => {
    checkedEndpointIds.push(node.id);
    if (assertRemovedNodeSkipped) {
      assert.notEqual(node.id, "removed-endpoint");
    }
    return false;
  };

  connect.resetObservedEndpointSelection(runtime);

  page.selection = [removedEndpoint];
  connect.handleSelectionChange(runtime);
  page.selection = [removedEndpoint, liveEndpoint];
  connect.handleSelectionChange(runtime);
  assert.deepEqual(getPendingEndpointIds(connect, runtime), ["removed-endpoint", "live-endpoint"]);

  removedEndpoint.removed = true;
  assertRemovedNodeSkipped = true;

  assert.deepEqual(getPendingEndpointIds(connect, runtime), ["live-endpoint"]);
  assert.ok(checkedEndpointIds.includes("live-endpoint"));
});

test("creates a Flow Connector without scanning children of unrelated frame obstacles", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const end = createNode(page, "end", 400);
  const unrelatedFrame = createNode(page, "unrelated-frame", 1000);
  const nestedChild = createNode(page, "nested-child", 1040);
  const connectorGroups = [];
  const runtime = createRuntime(page, connectorGroups);

  nestedChild.parent = unrelatedFrame;
  nestedChild.getSharedPluginData = () => {
    throw new Error("Unrelated frame obstacle descendants must not be scanned.");
  };
  unrelatedFrame.children = [nestedChild];
  page.children = [start, end, unrelatedFrame];
  globalThis.figma = createFigmaStub(page, connectorGroups);

  connect.resetObservedEndpointSelection(runtime);

  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);

  connect.createFlowConnector("", runtime);

  assert.equal(connectorGroups.length, 1);
  assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ["start", "end"]);
});

test("collects Context Frames and Annotation Cards as obstacles while excluding Annotation Badges", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const end = createNode(page, "end", 520);
  const middleFrame = createNode(page, "middle-frame", 220);
  const annotationCard = createNode(page, "annotation-card", 360);
  const annotationBadge = createNode(page, "annotation-badge", 460);
  const runtime = createRuntime(page);

  annotationCard.setSharedPluginData("figma_flow_annotator", "kind", "annotation-card");
  annotationBadge.setSharedPluginData("figma_flow_annotator", "kind", "annotation-badge");
  page.children = [start, middleFrame, annotationCard, annotationBadge, end];
  globalThis.figma = { currentPage: page };

  const obstacles = connect.collectConnectorObstacles(start, end, runtime);

  assert.deepEqual(
    obstacles.map((obstacle) => [obstacle.id, obstacle.kind]),
    [
      ["middle-frame", "context-frame"],
      ["annotation-card", "annotation-card"],
    ],
  );
});
