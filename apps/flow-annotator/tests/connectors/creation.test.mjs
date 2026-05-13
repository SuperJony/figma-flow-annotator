import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createFigmaStub,
  createNode,
  createRuntime,
  importConnectModule,
  readConnector,
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

  connect.resetObservedEndpointSelection(runtime);
  page.selection = [start];
  connect.handleSelectionChange(runtime);
  page.selection = [start, end];
  connect.handleSelectionChange(runtime);

  const created = await connect.createFlowConnector("click", runtime);
  const connectorsContainer = page.children.find((node) => node.name === "FFA Connectors");

  assert.equal(created.removed, false);
  assert.equal(connectorsContainer.children.includes(created), true);
  assert.equal(readConnector(created).flowAction, "click");
  assert.deepEqual(
    created.children.map((child) => child.name),
    ["FFA Connector Route", "FFA Flow Action Label"],
  );
  assert.equal(
    created.children.every((child) => child.parent === created),
    true,
  );
});
