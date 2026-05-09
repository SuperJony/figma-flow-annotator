import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createFigmaStub,
  createNode,
  createRuntime,
  expandRect,
  finalSegment,
  getLabelCenter,
  importConnectModule,
  moveNode,
  pointOnSegment,
  readConnector,
  readConnectorEndpointIds,
  readConnectorRefs,
  routeIntersectsRect,
  routeIsOrthogonal,
} from "./test-helpers.mjs";

test("routes around a middle Context Frame and writes only the successful route cache", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const middleFrame = createNode(page, "middle-frame", 180);
  const end = createNode(page, "end", 380);
  const connectorGroups = [];
  const runtime = createRuntime(page, connectorGroups);

  page.children = [start, middleFrame, end];
  globalThis.figma = createFigmaStub(page, connectorGroups);

  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);

  connect.createFlowConnector("", runtime);

  const routePoints = readConnector(connectorGroups[0]).routeCache.points;
  assert.equal(routeIsOrthogonal(routePoints), true);
  assert.equal(
    routeIntersectsRect(routePoints, expandRect(middleFrame.absoluteBoundingBox, 24)),
    false,
  );
  assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ["start", "end"]);
});

test("fails connector creation atomically when no legal route exists", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const walls = [
    createNode(page, "left-wall", -60),
    createNode(page, "right-wall", 80),
    createNode(page, "top-wall", -60),
    createNode(page, "bottom-wall", -60),
  ];
  const end = createNode(page, "end", 320);
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
    () => connect.createFlowConnector("", runtime),
    /No legal Orthogonal Route avoids Connector Obstacles/,
  );
  assert.equal(connectorGroups.length, 0);
  assert.equal(
    page.children.some((node) => node.name === "FFA Connectors"),
    false,
  );
  assert.deepEqual(readConnectorRefs(start), []);
  assert.deepEqual(readConnectorRefs(end), []);
});

test("upserts an existing directed Flow Connector and keeps reverse direction separate", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const end = createNode(page, "end", 400);
  const connectorGroups = [];
  const runtime = createRuntime(page, connectorGroups);

  page.children = [start, end];
  globalThis.figma = createFigmaStub(page, connectorGroups);

  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);

  connect.createFlowConnector("click", runtime);
  assert.equal(connectorGroups.length, 1);
  assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ["start", "end"]);
  assert.equal(readConnector(connectorGroups[0]).flowAction, "click");
  const unchangedConnectorData = connectorGroups[0].getSharedPluginData(
    "figma_flow_annotator",
    "connector",
  );

  connect.createFlowConnector(" click ", runtime);
  assert.equal(connectorGroups.length, 1);
  assert.equal(
    connectorGroups[0].getSharedPluginData("figma_flow_annotator", "connector"),
    unchangedConnectorData,
  );

  connect.createFlowConnector("", runtime);
  assert.equal(connectorGroups.length, 1);
  assert.equal(readConnector(connectorGroups[0]).flowAction, null);

  connect.swapPendingConnectorEndpoints(runtime);
  connect.createFlowConnector("", runtime);
  assert.equal(connectorGroups.length, 2);
  assert.deepEqual(readConnectorEndpointIds(connectorGroups[1]), ["end", "start"]);
  assert.deepEqual(readConnectorRefs(start), ["connector-1", "connector-2"]);
  assert.deepEqual(readConnectorRefs(end), ["connector-1", "connector-2"]);
});

test("reports Connect preview and existing directed connector status from project connector container only", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const end = createNode(page, "end", 400);
  const connectorGroups = [];
  const runtime = createRuntime(page, connectorGroups);

  page.children = [start, end];
  globalThis.figma = createFigmaStub(page, connectorGroups);

  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);
  connect.createFlowConnector("choose", runtime);

  const state = connect.getConnectSelectionState(runtime);

  assert.deepEqual(
    state.endpoints.map((endpoint) => endpoint.name),
    ["start", "end"],
  );
  assert.equal(state.existingConnector.id, "connector-1");
  assert.equal(state.existingConnector.flowAction, "choose");
  assert.equal(state.routingStatus, "Route preview pending router validation.");
});

test("regenerates trunked connector labels on branch segments after shared-end create", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const startA = createNode(page, "start-a", 0);
  const startB = createNode(page, "start-b", 0);
  const end = createNode(page, "end", 520);
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
  connect.createFlowConnector("from A", runtime);

  page.selection = [];
  connect.resetObservedEndpointSelection(runtime);
  page.selection = [startB];
  connect.handleSelectionChange(runtime);
  page.selection = [startB, end];
  connect.handleSelectionChange(runtime);
  connect.createFlowConnector("from B", runtime);

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
});

test("refreshes current-page Flow Connectors and gives selected connector roots precedence", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const end = createNode(page, "end", 400);
  const alternateEnd = createNode(page, "alternate-end", 400);
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
  connect.createFlowConnector("click", runtime);

  page.selection = [];
  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, alternateEnd];
  connect.handleSelectionChange(runtime);
  connect.createFlowConnector("choose", runtime);

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
  assert.deepEqual(
    selectedRefresh.nodes.map((node) => node.id),
    [connectorGroups[0].id],
  );
  assert.notDeepEqual(readConnector(connectorGroups[0]).routeCache.points, firstPageRoute);
  assert.deepEqual(readConnector(connectorGroups[1]).routeCache.points, secondPageRoute);
  assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ["start", "end"]);
  assert.equal(readConnector(connectorGroups[0]).flowAction, "click");
});

test("preserves an existing Flow Connector route and record when refresh routing fails", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const end = createNode(page, "end", 320);
  const connectorGroups = [];
  const runtime = createRuntime(page, connectorGroups);

  page.children = [start, end];
  globalThis.figma = createFigmaStub(page, connectorGroups);

  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);
  connect.createFlowConnector("click", runtime);

  const originalConnectorData = connectorGroups[0].getSharedPluginData(
    "figma_flow_annotator",
    "connector",
  );
  const originalChildIds = connectorGroups[0].children.map((child) => child.id);
  const walls = [
    createNode(page, "left-wall", -60),
    createNode(page, "right-wall", 80),
    createNode(page, "top-wall", -60),
    createNode(page, "bottom-wall", -60),
  ];

  [
    { x: -60, y: -60, width: 50, height: 200 },
    { x: 80, y: -60, width: 50, height: 200 },
    { x: -60, y: -60, width: 190, height: 50 },
    { x: -60, y: 80, width: 190, height: 50 },
  ].forEach((rect, index) => {
    moveNode(walls[index], rect);
  });
  page.children = [
    start,
    ...walls,
    end,
    page.children.find((node) => node.name === "FFA Connectors"),
  ];
  page.selection = [connectorGroups[0]];

  const result = await connect.refreshFlowConnectors(runtime);

  assert.equal(result.selectedOnly, true);
  assert.equal(result.refreshedCount, 0);
  assert.equal(result.failedCount, 1);
  assert.match(result.failures[0], /No legal Orthogonal Route avoids Connector Obstacles/);
  assert.equal(
    connectorGroups[0].getSharedPluginData("figma_flow_annotator", "connector"),
    originalConnectorData,
  );
  assert.deepEqual(
    connectorGroups[0].children.map((child) => child.id),
    originalChildIds,
  );
});
