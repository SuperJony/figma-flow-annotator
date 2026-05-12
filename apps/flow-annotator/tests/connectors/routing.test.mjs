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
  setValidationIndex,
} from "./test-helpers.mjs";

test("routes around indexed Context Frames and Annotation Cards without page frame discovery", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const middleFrame = createNode(page, "middle-frame", 180);
  const annotationCard = createNode(page, "annotation-card", 360);
  const annotationBadge = createNode(page, "annotation-badge", 480);
  const end = createNode(page, "end", 620);
  const connectorsContainer = createNode(page, "connector-container", 0);
  const connectorGroups = [];
  const runtime = createRuntime(page, connectorGroups);

  annotationCard.setSharedPluginData("figma_flow_annotator", "kind", "annotation-card");
  annotationBadge.setSharedPluginData("figma_flow_annotator", "kind", "annotation-badge");
  connectorsContainer.name = "FFA Connectors";
  connectorsContainer.children = connectorGroups;
  connectorsContainer.setSharedPluginData("figma_flow_annotator", "kind", "container");
  setValidationIndex(connectorsContainer, {
    annotationBadgeNodeIds: [annotationBadge.id],
    annotationCardNodeIds: [annotationCard.id],
    connectorObstacleCandidateNodeIds: [middleFrame.id, annotationCard.id, annotationBadge.id],
    contextFrameIds: [middleFrame.id],
  });
  page.children = [start, middleFrame, annotationCard, annotationBadge, end, connectorsContainer];
  globalThis.figma = createFigmaStub(page, connectorGroups);
  page.findAllWithCriteria = () => {
    throw new Error("Create Flow Connector must not use page-level frame discovery.");
  };

  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);

  const created = await connect.createFlowConnector("", runtime);

  const routePoints = readConnector(created).routeCache.points;
  assert.equal(routeIsOrthogonal(routePoints), true);
  assert.equal(
    routeIntersectsRect(routePoints, expandRect(middleFrame.absoluteBoundingBox, 24)),
    false,
  );
  assert.equal(
    routeIntersectsRect(routePoints, expandRect(annotationCard.absoluteBoundingBox, 24)),
    false,
  );
  assert.deepEqual(readConnectorEndpointIds(created), ["start", "end"]);
});

test("does not treat indexed Annotation Badges as Create Flow Connector obstacles", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const annotationBadge = createNode(page, "annotation-badge", 180);
  const end = createNode(page, "end", 400);
  const annotationsContainer = createNode(page, "annotation-container", 0);
  const connectorGroups = [];
  const runtime = createRuntime(page, connectorGroups);

  annotationBadge.setSharedPluginData("figma_flow_annotator", "kind", "annotation-badge");
  annotationsContainer.name = "FFA Annotations";
  annotationsContainer.setSharedPluginData("figma_flow_annotator", "kind", "container");
  setValidationIndex(annotationsContainer, {
    annotationBadgeNodeIds: [annotationBadge.id],
    connectorObstacleCandidateNodeIds: [annotationBadge.id],
  });
  page.children = [start, annotationBadge, end, annotationsContainer];
  globalThis.figma = createFigmaStub(page, connectorGroups);
  page.findAllWithCriteria = () => {
    throw new Error("Create Flow Connector must not use page-level frame discovery.");
  };

  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);

  const created = await connect.createFlowConnector("", runtime);

  assert.equal(
    routeIntersectsRect(
      readConnector(created).routeCache.points,
      expandRect(annotationBadge.absoluteBoundingBox, 24),
    ),
    true,
  );
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
  const annotationsContainer = createNode(page, "annotation-container", 0);
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
  annotationsContainer.name = "FFA Annotations";
  annotationsContainer.setSharedPluginData("figma_flow_annotator", "kind", "container");
  setValidationIndex(annotationsContainer, {
    connectorObstacleCandidateNodeIds: walls.map((wall) => wall.id),
    contextFrameIds: walls.map((wall) => wall.id),
  });
  page.children = [start, ...walls, end, annotationsContainer];
  globalThis.figma = createFigmaStub(page, connectorGroups);
  page.findAllWithCriteria = () => {
    throw new Error("Create Flow Connector must not use page-level frame discovery.");
  };

  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);

  await assert.rejects(
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

  await connect.createFlowConnector("click", runtime);
  assert.equal(connectorGroups.length, 1);
  assert.deepEqual(readConnectorEndpointIds(connectorGroups[0]), ["start", "end"]);
  assert.equal(readConnector(connectorGroups[0]).flowAction, "click");
  const unchangedConnectorData = connectorGroups[0].getSharedPluginData(
    "figma_flow_annotator",
    "connector",
  );

  await connect.createFlowConnector(" click ", runtime);
  assert.equal(connectorGroups.length, 1);
  assert.equal(
    connectorGroups[0].getSharedPluginData("figma_flow_annotator", "connector"),
    unchangedConnectorData,
  );

  await connect.createFlowConnector("", runtime);
  assert.equal(connectorGroups.length, 1);
  assert.equal(readConnector(connectorGroups[0]).flowAction, null);

  connect.swapPendingConnectorEndpoints(runtime);
  await connect.createFlowConnector("", runtime);
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
  await connect.createFlowConnector("choose", runtime);

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
  await connect.createFlowConnector("from A", runtime);

  page.selection = [];
  connect.resetObservedEndpointSelection(runtime);
  page.selection = [startB];
  connect.handleSelectionChange(runtime);
  page.selection = [startB, end];
  connect.handleSelectionChange(runtime);
  await connect.createFlowConnector("from B", runtime);

  assert.equal(connectorGroups.length, 2);
  assertConnectorTrunkLabels(connectorGroups);

  page.findAllWithCriteria = () => {
    throw new Error("Refresh Flow Connector must not use page-level frame discovery.");
  };

  moveNode(end, { x: 640, y: 110, width: 100, height: 100 });
  page.selection = [];
  const pageRefresh = await connect.refreshFlowConnectors(runtime);

  assert.equal(pageRefresh.selectedOnly, false);
  assert.equal(pageRefresh.refreshedCount, 2);
  assert.equal(pageRefresh.failedCount, 0);
  assertConnectorTrunkLabels(connectorGroups);

  const pageRefreshRoutes = connectorGroups.map(
    (connector) => readConnector(connector).routeCache.points,
  );

  page.selection = [connectorGroups[0]];
  const selectedRefresh = await connect.refreshFlowConnectors(runtime);

  assert.equal(selectedRefresh.selectedOnly, true);
  assert.equal(selectedRefresh.refreshedCount, 1);
  assert.equal(selectedRefresh.failedCount, 0);
  assert.deepEqual(readConnector(connectorGroups[0]).routeCache.points, pageRefreshRoutes[0]);
  assert.deepEqual(readConnector(connectorGroups[1]).routeCache.points, pageRefreshRoutes[1]);
  assertConnectorTrunkLabels(connectorGroups);
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
  await connect.createFlowConnector("click", runtime);

  page.selection = [];
  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, alternateEnd];
  connect.handleSelectionChange(runtime);
  await connect.createFlowConnector("choose", runtime);

  const firstInitialRoute = readConnector(connectorGroups[0]).routeCache.points;
  const secondInitialRoute = readConnector(connectorGroups[1]).routeCache.points;
  page.findAllWithCriteria = () => {
    throw new Error("Refresh Flow Connector must not use page-level frame discovery.");
  };

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
  await connect.createFlowConnector("click", runtime);

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
  const connectorsContainer = page.children.find((node) => node.name === "FFA Connectors");
  assert.ok(connectorsContainer, "expected Flow Connector container after creation");
  setValidationIndex(connectorsContainer, {
    connectorObstacleCandidateNodeIds: walls.map((wall) => wall.id),
    contextFrameIds: walls.map((wall) => wall.id),
  });
  page.children = [start, ...walls, end, connectorsContainer];
  page.selection = [connectorGroups[0]];
  page.findAllWithCriteria = () => {
    throw new Error("Refresh Flow Connector must not use page-level frame discovery.");
  };

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

test("preserves failed connector visuals during mixed page refresh", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const failingStart = createNode(page, "failing-start", 0);
  const failingEnd = createNode(page, "failing-end", 320);
  const successfulStart = createNode(page, "successful-start", 0);
  const successfulEnd = createNode(page, "successful-end", 320);
  const connectorGroups = [];
  const runtime = createRuntime(page, connectorGroups);

  moveNode(successfulStart, { x: 0, y: 260, width: 100, height: 100 });
  moveNode(successfulEnd, { x: 320, y: 260, width: 100, height: 100 });
  page.children = [failingStart, failingEnd, successfulStart, successfulEnd];
  globalThis.figma = createFigmaStub(page, connectorGroups);

  connect.resetObservedEndpointSelection(runtime);
  page.selection = [failingStart];
  connect.handleSelectionChange(runtime);
  page.selection = [failingStart, failingEnd];
  connect.handleSelectionChange(runtime);
  await connect.createFlowConnector("blocked", runtime);

  page.selection = [];
  connect.resetObservedEndpointSelection(runtime);
  page.selection = [successfulStart];
  connect.handleSelectionChange(runtime);
  page.selection = [successfulStart, successfulEnd];
  connect.handleSelectionChange(runtime);
  await connect.createFlowConnector("succeeds", runtime);

  const failingConnector = connectorGroups[0];
  const successfulConnector = connectorGroups[1];
  const originalFailingConnectorData = failingConnector.getSharedPluginData(
    "figma_flow_annotator",
    "connector",
  );
  const originalFailingChildIds = failingConnector.children.map((child) => child.id);
  const originalSuccessfulRoute = readConnector(successfulConnector).routeCache.points;
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
  const connectorsContainer = page.children.find((node) => node.name === "FFA Connectors");
  assert.ok(connectorsContainer, "expected Flow Connector container after creation");
  setValidationIndex(connectorsContainer, {
    connectorObstacleCandidateNodeIds: walls.map((wall) => wall.id),
    contextFrameIds: walls.map((wall) => wall.id),
  });
  page.children = [
    failingStart,
    ...walls,
    failingEnd,
    successfulStart,
    successfulEnd,
    connectorsContainer,
  ];
  page.selection = [];
  page.findAllWithCriteria = () => {
    throw new Error("Refresh Flow Connector must not use page-level frame discovery.");
  };

  moveNode(successfulEnd, { x: 560, y: 260, width: 100, height: 100 });
  const result = await connect.refreshFlowConnectors(runtime);

  assert.equal(result.selectedOnly, false);
  assert.equal(result.refreshedCount, 1);
  assert.equal(result.failedCount, 1);
  assert.match(result.failures[0], /No legal Orthogonal Route avoids Connector Obstacles/);
  assert.equal(
    failingConnector.getSharedPluginData("figma_flow_annotator", "connector"),
    originalFailingConnectorData,
  );
  assert.deepEqual(
    failingConnector.children.map((child) => child.id),
    originalFailingChildIds,
  );
  assert.notDeepEqual(
    readConnector(successfulConnector).routeCache.points,
    originalSuccessfulRoute,
  );
});

function assertConnectorTrunkLabels(connectorGroups) {
  const firstRoute = readConnector(connectorGroups[0]).routeCache.points;
  const secondRoute = readConnector(connectorGroups[1]).routeCache.points;
  const sharedFinalSegment = finalSegment(firstRoute);
  assert.deepEqual(finalSegment(secondRoute), sharedFinalSegment);

  const firstLabelCenter = getLabelCenter(connectorGroups[0]);
  const secondLabelCenter = getLabelCenter(connectorGroups[1]);
  assert.equal(pointOnSegment(firstLabelCenter, sharedFinalSegment), false);
  assert.equal(pointOnSegment(secondLabelCenter, sharedFinalSegment), false);
  assert.notDeepEqual(firstLabelCenter, secondLabelCenter);
}
