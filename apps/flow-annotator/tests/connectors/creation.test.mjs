import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFlowConnectorVisualModel,
  CONNECTORS_CONTAINER_NAME,
} from "@figma-flow-annotator/core";
import {
  CONNECTOR_ROUTE_NODE_NAME,
  createFigmaStub,
  createNode,
  createRuntime,
  FLOW_ACTION_LABEL_NODE_NAME,
  importConnectModule,
  readConnector,
  selectConnectorEndpoints,
} from "./test-helpers.mjs";

test("regenerates connector visuals without emptying the Flow Connector root", async () => {
  const connect = await importConnectModule();
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const start = createNode(page, "start", 0);
  const end = createNode(page, "end", 400);
  const connectorGroups = [];
  const runtime = createRuntime(page, connectorGroups);

  page.children = [start, end];
  globalThis.figma = createFigmaStub(page, connectorGroups, { removeEmptyGroups: true });

  selectConnectorEndpoints(connect, runtime, page, start, end);

  const created = await connect.createFlowConnector("click", runtime);
  const connectorsContainer = page.children.find((node) => node.name === CONNECTORS_CONTAINER_NAME);

  assert.equal(created.removed, false);
  assert.equal(connectorsContainer.children.includes(created), true);
  const connector = readConnector(created);
  assert.equal(connector.flowAction, "click");
  assert.deepEqual(
    created.children.map((child) => child.name),
    [CONNECTOR_ROUTE_NODE_NAME, FLOW_ACTION_LABEL_NODE_NAME],
  );
  assert.equal(
    created.children.every((child) => child.parent === created),
    true,
  );

  const label = created.children.find((child) => child.name === FLOW_ACTION_LABEL_NODE_NAME);
  assert.ok(label, "expected Flow Action label visual node");
  const expectedLabel = buildFlowConnectorVisualModel({
    flowAction: "click",
    routePoints: connector.routeCache.points,
  }).label;
  assert.ok(expectedLabel, "expected Flow Action label visual model");
  assert.equal(label.layoutMode, "HORIZONTAL");
  assert.equal(label.primaryAxisSizingMode, "AUTO");
  assert.equal(label.counterAxisSizingMode, "AUTO");
  assert.equal(label.primaryAxisAlignItems, "CENTER");
  assert.equal(label.counterAxisAlignItems, "CENTER");
  assert.equal(label.paddingLeft, expectedLabel.paddingX);
  assert.equal(label.paddingRight, expectedLabel.paddingX);
  assert.equal(label.paddingTop, expectedLabel.paddingY);
  assert.equal(label.paddingBottom, expectedLabel.paddingY);
  assert.equal(label.minWidth, expectedLabel.minWidth);
  assert.equal(label.minHeight, expectedLabel.minHeight);
  assert.equal(label.width >= expectedLabel.minWidth, true);
  assert.equal(label.height >= expectedLabel.minHeight, true);
  assert.equal(label.children[0].parent, label);
});

test("figma stub removes emptied connector groups without splitting the child array", async () => {
  const page = { type: "PAGE", id: "page", children: [], selection: [] };
  const connectorGroups = [];
  const runtime = createRuntime(page, connectorGroups);
  const figma = createFigmaStub(page, connectorGroups, { removeEmptyGroups: true });
  const connectorsContainer = runtime.ensureContainer(CONNECTORS_CONTAINER_NAME);
  const visualNode = createNode(page, "visual-node", 0);

  const group = figma.group([visualNode], connectorsContainer);

  assert.equal(connectorsContainer.children, connectorGroups);
  assert.equal(connectorGroups.includes(group), true);

  visualNode.remove();

  assert.equal(group.removed, true);
  assert.equal(connectorsContainer.children, connectorGroups);
  assert.equal(connectorGroups.includes(group), false);
});
