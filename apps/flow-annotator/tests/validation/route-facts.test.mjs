import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createFigmaStub,
  createNode,
  createPage,
  flushPluginMessage,
  forbidPageFindAllWithCriteria,
  importCodeModule,
  moveNode,
  namespace,
  setBadgeRecord,
  setConnectorRecord,
  setValidationIndex,
} from "../support/plugin-test-helpers.mjs";

test("validates route obstacles from bounded connector route facts", async () => {
  const page = createPage();
  const contextFrame = createNode(page, "context-frame", 0);
  const start = createNode(contextFrame, "start-endpoint", 0);
  const end = createNode(contextFrame, "end-endpoint", 420);
  const indexedObstacle = createNode(page, "indexed-middle-frame", 190);
  const indexedBadge = createNode(page, "indexed-badge", 250);
  const unrelatedFrame = createNode(page, "unrelated-frame", 700);
  const connectorsContainer = createNode(page, "FFA Connectors", 900);
  const connector = createNode(connectorsContainer, "connector-indexed-root", 920);
  const messages = [];
  const resolvedNodeIds = [];

  moveNode(contextFrame, { x: -20, y: -20, width: 560, height: 160 });
  moveNode(start, { x: 0, y: 0, width: 100, height: 100 });
  moveNode(end, { x: 420, y: 0, width: 100, height: 100 });
  moveNode(indexedObstacle, { x: 190, y: 0, width: 100, height: 120 });
  moveNode(indexedBadge, { x: 250, y: 34, width: 32, height: 32 });
  Object.defineProperty(unrelatedFrame, "children", {
    get() {
      throw new Error("Validate Bindings must not scan unrelated route obstacle descendants.");
    },
  });
  connectorsContainer.setSharedPluginData(namespace, "kind", "container");
  setBadgeRecord(indexedBadge, 1, start.id, contextFrame.id);
  setConnectorRecord(connector, "connector-indexed", start.id, end.id, "open", [
    { x: 100, y: 50 },
    { x: 420, y: 50 },
  ]);
  setValidationIndex(connectorsContainer, {
    annotationBadgeNodeIds: [indexedBadge.id],
    connectorRootNodeIds: [connector.id],
    connectorObstacleCandidateNodeIds: [
      start.id,
      end.id,
      contextFrame.id,
      indexedObstacle.id,
      indexedBadge.id,
    ],
    contextFrameIds: [contextFrame.id, indexedObstacle.id],
    flowEndpointNodeIds: [start.id, end.id],
  });

  contextFrame.children = [start, end];
  connectorsContainer.children = [connector];
  page.children = [
    contextFrame,
    indexedObstacle,
    indexedBadge,
    unrelatedFrame,
    connectorsContainer,
  ];
  forbidPageFindAllWithCriteria(
    page,
    "Validate Bindings must not call page-wide findAllWithCriteria for route facts.",
  );
  globalThis.figma = createFigmaStub(page, messages);
  globalThis.figma.getNodeByIdAsync = async (nodeId) => {
    resolvedNodeIds.push(nodeId);
    if (nodeId === unrelatedFrame.id) {
      throw new Error("Validate Bindings must not resolve unrelated route obstacles.");
    }
    return page.__nodesById?.get(nodeId) ?? null;
  };

  await importCodeModule();

  globalThis.figma.ui.onmessage({ type: "validate-bindings" });
  await flushPluginMessage(messages);

  const report = messages.find((message) => message.type === "validation-report").report;
  const crossingIssue = report.issues.find(
    (issue) => issue.code === "connector-route-crosses-obstacle",
  );
  assert.ok(crossingIssue);
  assert.deepEqual(crossingIssue.locationNodeIds, ["connector-indexed-root"]);
  assert.equal(resolvedNodeIds.includes(indexedBadge.id), false);
  assert.equal(resolvedNodeIds.includes(unrelatedFrame.id), false);
});
